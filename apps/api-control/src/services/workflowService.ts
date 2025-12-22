import { db } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'transform';
  config: Record<string, any>;
  next?: string[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  variables?: Record<string, any>;
}

export interface WorkflowContext {
  variables: Record<string, any>;
  executionId: string;
  organizationId: string;
  userId: string;
}

export class WorkflowEngine {
  private aiApiUrl: string;

  constructor() {
    this.aiApiUrl = process.env.AI_API_URL || 'http://localhost:5000';
  }

  async executeWorkflow(
    workflow: WorkflowDefinition,
    context: WorkflowContext,
    input?: Record<string, any>
  ): Promise<any> {
    logger.info('Starting workflow execution', {
      workflowId: workflow.id,
      executionId: context.executionId,
    });

    // Initialize context variables
    context.variables = {
      ...workflow.variables,
      ...context.variables,
      ...input,
    };

    // Create workflow run record
    await db('workflow_runs').insert({
      id: context.executionId,
      workflow_id: workflow.id,
      organization_id: context.organizationId,
      user_id: context.userId,
      status: 'running',
      input: input || {},
      started_at: new Date(),
    });

    try {
      // Find trigger node
      const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
      if (!triggerNode) {
        throw new Error('No trigger node found in workflow');
      }

      // Execute from trigger
      const result = await this.executeNode(triggerNode, workflow, context);

      // Update workflow run as completed
      await db('workflow_runs')
        .where({ id: context.executionId })
        .update({
          status: 'completed',
          output: result ?? null,
          completed_at: new Date(),
        });

      logger.info('Workflow execution completed', {
        workflowId: workflow.id,
        executionId: context.executionId,
      });

      return result;
    } catch (error: any) {
      logger.error('Workflow execution failed', {
        workflowId: workflow.id,
        executionId: context.executionId,
        error: error.message,
      });

      // Update workflow run as failed
      await db('workflow_runs')
        .where({ id: context.executionId })
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date(),
        });

      throw error;
    }
  }

  private async executeNode(
    node: WorkflowNode,
    workflow: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<any> {
    logger.debug('Executing node', { nodeId: node.id, type: node.type });

    let result: any;

    switch (node.type) {
      case 'trigger':
        result = await this.executeTrigger(node, context);
        break;
      case 'action':
        result = await this.executeAction(node, context);
        break;
      case 'condition':
        result = await this.executeCondition(node, context);
        break;
      case 'transform':
        result = await this.executeTransform(node, context);
        break;
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }

    // Store result in context
    context.variables[`node_${node.id}`] = result;

    // Execute next nodes
    if (node.next && node.next.length > 0) {
      const nextResults = [];
      for (const nextNodeId of node.next) {
        const nextNode = workflow.nodes.find((n) => n.id === nextNodeId);
        if (nextNode) {
          const nextResult = await this.executeNode(nextNode, workflow, context);
          nextResults.push(nextResult);
        }
      }
      return nextResults.length === 1 ? nextResults[0] : nextResults;
    }

    return result;
  }

  private async executeTrigger(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<any> {
    // Trigger nodes just pass through the input
    return context.variables;
  }

  private async executeAction(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<any> {
    const { actionType, config } = node.config;

    switch (actionType) {
      case 'ai_chat':
        return await this.executeAIChat(config, context);
      case 'ai_completion':
        return await this.executeAICompletion(config, context);
      case 'ai_embeddings':
        return await this.executeAIEmbeddings(config, context);
      case 'http_request':
        return await this.executeHttpRequest(config, context);
      case 'delay':
        return await this.executeDelay(config);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private async executeCondition(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<any> {
    const { condition } = node.config;
    
    // Simple condition evaluation
    // In production, use a proper expression evaluator
    const result = this.evaluateCondition(condition, context.variables);
    
    return { conditionMet: result };
  }

  private async executeTransform(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<any> {
    const { transformation } = node.config;
    
    // Apply transformation to variables
    // In production, use a proper transformation engine
    return this.applyTransformation(transformation, context.variables);
  }

  private async executeAIChat(
    config: Record<string, any>,
    context: WorkflowContext
  ): Promise<any> {
    const messages = this.interpolateVariables(config.messages, context.variables);
    
    const response = await axios.post(
      `${this.aiApiUrl}/api/v1/chat`,
      {
        messages,
        model: config.model || 'gpt-4.1-mini',
        temperature: config.temperature || 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${context.variables.apiKey}`,
        },
      }
    );

    return response.data;
  }

  private async executeAICompletion(
    config: Record<string, any>,
    context: WorkflowContext
  ): Promise<any> {
    const prompt = this.interpolateString(config.prompt, context.variables);
    
    const response = await axios.post(
      `${this.aiApiUrl}/api/v1/completions`,
      {
        prompt,
        model: config.model || 'gpt-4.1-mini',
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 500,
      },
      {
        headers: {
          Authorization: `Bearer ${context.variables.apiKey}`,
        },
      }
    );

    return response.data;
  }

  private async executeAIEmbeddings(
    config: Record<string, any>,
    context: WorkflowContext
  ): Promise<any> {
    const input = this.interpolateVariables(config.input, context.variables);
    
    const response = await axios.post(
      `${this.aiApiUrl}/api/v1/embeddings`,
      {
        input,
        model: config.model || 'text-embedding-ada-002',
      },
      {
        headers: {
          Authorization: `Bearer ${context.variables.apiKey}`,
        },
      }
    );

    return response.data;
  }

  private async executeHttpRequest(
    config: Record<string, any>,
    context: WorkflowContext
  ): Promise<any> {
    const url = this.interpolateString(config.url, context.variables);
    const method = config.method || 'GET';
    const headers = this.interpolateVariables(config.headers || {}, context.variables);
    const body = this.interpolateVariables(config.body, context.variables);

    const response = await axios({
      method,
      url,
      headers,
      data: body,
    });

    return response.data;
  }

  private async executeDelay(config: Record<string, any>): Promise<any> {
    const duration = config.duration || 1000;
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { delayed: duration };
  }

  private interpolateString(template: string, variables: Record<string, any>): string {
    if (!template) return template;
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  private interpolateVariables(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.interpolateString(obj, variables);
    }
    
    if (Array.isArray(obj)) {
      return obj.map((item) => this.interpolateVariables(item, variables));
    }
    
    if (obj && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateVariables(value, variables);
      }
      return result;
    }
    
    return obj;
  }

  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    // Safe condition evaluator:
    // Supports: (), !, &&, ||, ==, !=, >, >=, <, <=
    // Variables: {{foo}}, {{foo.bar}}, {{foo_bar}}
    try {
      const parser = new ConditionParser(condition, variables);
      return parser.parseExpression();
    } catch (e) {
      logger.warn('Condition evaluation failed', { condition, error: (e as Error)?.message });
      return false;
    }
  }

  private applyTransformation(transformation: any, variables: Record<string, any>): any {
    return this.interpolateVariables(transformation, variables);
  }
}

export const workflowEngine = new WorkflowEngine();

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'var'; path: string }
  | { type: 'op'; value: '==' | '!=' | '>=' | '<=' | '>' | '<' | '&&' | '||' | '!' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'eof' };

class ConditionParser {
  private i = 0;
  private tokens: Token[];

  constructor(input: string, private variables: Record<string, any>) {
    this.tokens = tokenizeCondition(input);
  }

  parseExpression(): boolean {
    const v = this.parseOr();
    this.expect('eof');
    return Boolean(v);
  }

  private parseOr(): any {
    let left = this.parseAnd();
    while (this.peekIsOp('||')) {
      this.next(); // ||
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): any {
    let left = this.parseUnary();
    while (this.peekIsOp('&&')) {
      this.next(); // &&
      const right = this.parseUnary();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseUnary(): any {
    if (this.peekIsOp('!')) {
      this.next();
      return !Boolean(this.parseUnary());
    }
    return this.parseComparison();
  }

  private parseComparison(): any {
    let left = this.parsePrimary();
    const op = this.peek();
    if (op.type === 'op' && ['==', '!=', '>=', '<=', '>', '<'].includes(op.value)) {
      this.next();
      const right = this.parsePrimary();
      return compareValues(left, op.value, right);
    }
    return left;
  }

  private parsePrimary(): any {
    const t = this.next();
    switch (t.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return t.value;
      case 'null':
        return null;
      case 'var':
        return getPath(this.variables, t.path);
      case 'lparen': {
        const v = this.parseOr();
        this.expect('rparen');
        return v;
      }
      default:
        throw new Error(`Unexpected token: ${t.type}`);
    }
  }

  private peek(): Token {
    return this.tokens[this.i] || { type: 'eof' };
  }

  private next(): Token {
    const t = this.peek();
    this.i += 1;
    return t;
  }

  private expect(type: Token['type']) {
    const t = this.next();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
  }

  private peekIsOp(value: Token extends { type: 'op' } ? never : any): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === value;
  }
}

function tokenizeCondition(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const isWs = (c: string) => /\s/.test(c);
  const peek = () => input[i] || '';
  const take = () => input[i++] || '';

  while (i < input.length) {
    const c = peek();
    if (isWs(c)) {
      i += 1;
      continue;
    }

    // {{var}} or {{var.path}}
    if (c === '{' && input[i + 1] === '{') {
      i += 2;
      let path = '';
      while (i < input.length && !(input[i] === '}' && input[i + 1] === '}')) {
        path += take();
      }
      if (!(input[i] === '}' && input[i + 1] === '}')) throw new Error('Unterminated {{ }}');
      i += 2;
      path = path.trim();
      if (!/^[A-Za-z0-9_.]+$/.test(path)) throw new Error(`Invalid variable path: ${path}`);
      tokens.push({ type: 'var', path });
      continue;
    }

    // parentheses
    if (c === '(') {
      i += 1;
      tokens.push({ type: 'lparen' });
      continue;
    }
    if (c === ')') {
      i += 1;
      tokens.push({ type: 'rparen' });
      continue;
    }

    // operators (2-char first)
    const two = input.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '==' || two === '!=' || two === '>=' || two === '<=') {
      i += 2;
      tokens.push({ type: 'op', value: two as any });
      continue;
    }
    if (c === '!' || c === '>' || c === '<') {
      i += 1;
      tokens.push({ type: 'op', value: c as any });
      continue;
    }

    // string literals
    if (c === '"' || c === "'") {
      const quote = take();
      let s = '';
      while (i < input.length) {
        const ch = take();
        if (ch === '\\') {
          const esc = take();
          s += esc;
          continue;
        }
        if (ch === quote) break;
        s += ch;
      }
      tokens.push({ type: 'string', value: s });
      continue;
    }

    // number
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(input[i + 1] || ''))) {
      let raw = '';
      while (i < input.length && /[0-9.]/.test(peek())) raw += take();
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: 'number', value: n });
      continue;
    }

    // keywords: true/false/null
    if (/[A-Za-z]/.test(c)) {
      let raw = '';
      while (i < input.length && /[A-Za-z]/.test(peek())) raw += take();
      if (raw === 'true') tokens.push({ type: 'boolean', value: true });
      else if (raw === 'false') tokens.push({ type: 'boolean', value: false });
      else if (raw === 'null') tokens.push({ type: 'null' });
      else throw new Error(`Unknown identifier: ${raw}`);
      continue;
    }

    throw new Error(`Unexpected character: ${c}`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

function getPath(obj: any, path: string): any {
  const parts = path.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function compareValues(left: any, op: '==' | '!=' | '>=' | '<=' | '>' | '<', right: any): boolean {
  if (op === '==' || op === '!=') {
    const eq = left === right;
    return op === '==' ? eq : !eq;
  }

  // For ordering comparisons, prefer numeric if both look numeric
  const ln = toComparableNumber(left);
  const rn = toComparableNumber(right);
  if (ln !== null && rn !== null) {
    switch (op) {
      case '>':
        return ln > rn;
      case '>=':
        return ln >= rn;
      case '<':
        return ln < rn;
      case '<=':
        return ln <= rn;
    }
  }

  // Otherwise, only compare strings to strings
  if (typeof left === 'string' && typeof right === 'string') {
    switch (op) {
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
    }
  }

  return false;
}

function toComparableNumber(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
