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
      input: JSON.stringify(input),
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
          output: JSON.stringify(result),
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
          error: error.message,
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
    // Simple condition evaluation
    // In production, use a safe expression evaluator
    try {
      const interpolated = this.interpolateString(condition, variables);
      return eval(interpolated);
    } catch {
      return false;
    }
  }

  private applyTransformation(transformation: any, variables: Record<string, any>): any {
    return this.interpolateVariables(transformation, variables);
  }
}

export const workflowEngine = new WorkflowEngine();
