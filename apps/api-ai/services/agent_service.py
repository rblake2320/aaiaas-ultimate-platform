"""
Advanced AI Agent Framework
Implements autonomous agents with tool calling, memory, and planning
"""

from typing import List, Dict, Any, Optional, Callable
from openai import OpenAI
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class Tool:
    """Represents a tool that an agent can use"""
    
    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        function: Callable
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.function = function
    
    def to_openai_format(self) -> Dict[str, Any]:
        """Convert tool to OpenAI function calling format"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }
    
    async def execute(self, **kwargs) -> Any:
        """Execute the tool function"""
        try:
            return await self.function(**kwargs) if callable(self.function) else self.function(**kwargs)
        except Exception as e:
            logger.error(f"Tool execution failed: {str(e)}")
            return {"error": str(e)}

class AgentMemory:
    """Agent memory for storing conversation history and context"""
    
    def __init__(self, max_messages: int = 50):
        self.messages: List[Dict[str, Any]] = []
        self.max_messages = max_messages
        self.metadata: Dict[str, Any] = {}
    
    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """Add a message to memory"""
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat()
        }
        if metadata:
            message["metadata"] = metadata
        
        self.messages.append(message)
        
        # Trim if exceeds max
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages:]
    
    def get_messages(self, last_n: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get messages from memory"""
        if last_n:
            return self.messages[-last_n:]
        return self.messages
    
    def clear(self):
        """Clear all messages"""
        self.messages = []
    
    def set_metadata(self, key: str, value: Any):
        """Set metadata"""
        self.metadata[key] = value
    
    def get_metadata(self, key: str) -> Any:
        """Get metadata"""
        return self.metadata.get(key)

class Agent:
    """Autonomous AI Agent with tool calling and memory"""
    
    def __init__(
        self,
        name: str,
        system_prompt: str,
        tools: Optional[List[Tool]] = None,
        model: str = "gpt-4.1-mini",
        temperature: float = 0.7,
        max_iterations: int = 10
    ):
        self.name = name
        self.system_prompt = system_prompt
        self.tools = tools or []
        self.model = model
        self.temperature = temperature
        self.max_iterations = max_iterations
        self.memory = AgentMemory()
        self.client = OpenAI()
        
        # Tool registry
        self.tool_registry = {tool.name: tool for tool in self.tools}
    
    def add_tool(self, tool: Tool):
        """Add a tool to the agent"""
        self.tools.append(tool)
        self.tool_registry[tool.name] = tool
    
    async def think(self, user_input: str) -> Dict[str, Any]:
        """
        Agent thinking process with tool calling
        
        Args:
            user_input: User's input/question
            
        Returns:
            Agent's response with execution trace
        """
        # Add user message to memory
        self.memory.add_message("user", user_input)
        
        # Build messages for API call
        messages = [
            {"role": "system", "content": self.system_prompt}
        ] + [
            {"role": msg["role"], "content": msg["content"]}
            for msg in self.memory.get_messages()
        ]
        
        execution_trace = []
        iteration = 0
        
        while iteration < self.max_iterations:
            iteration += 1
            
            # Prepare API call
            api_params = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature
            }
            
            # Add tools if available
            if self.tools:
                api_params["tools"] = [tool.to_openai_format() for tool in self.tools]
                api_params["tool_choice"] = "auto"
            
            # Call LLM
            try:
                response = self.client.chat.completions.create(**api_params)
                choice = response.choices[0]
                message = choice.message
                
                # Add to trace
                execution_trace.append({
                    "iteration": iteration,
                    "type": "llm_call",
                    "finish_reason": choice.finish_reason
                })
                
                # Check if tool calls are needed
                if choice.finish_reason == "tool_calls" and message.tool_calls:
                    # Execute tool calls
                    for tool_call in message.tool_calls:
                        tool_name = tool_call.function.name
                        tool_args = json.loads(tool_call.function.arguments)
                        
                        execution_trace.append({
                            "iteration": iteration,
                            "type": "tool_call",
                            "tool": tool_name,
                            "arguments": tool_args
                        })
                        
                        # Execute tool
                        if tool_name in self.tool_registry:
                            tool_result = await self.tool_registry[tool_name].execute(**tool_args)
                        else:
                            tool_result = {"error": f"Tool {tool_name} not found"}
                        
                        execution_trace.append({
                            "iteration": iteration,
                            "type": "tool_result",
                            "tool": tool_name,
                            "result": tool_result
                        })
                        
                        # Add tool result to messages
                        messages.append({
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [tool_call.model_dump()]
                        })
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(tool_result)
                        })
                    
                    # Continue loop to get final answer
                    continue
                
                # Got final answer
                final_answer = message.content
                self.memory.add_message("assistant", final_answer)
                
                return {
                    "answer": final_answer,
                    "iterations": iteration,
                    "execution_trace": execution_trace,
                    "usage": {
                        "prompt_tokens": response.usage.prompt_tokens,
                        "completion_tokens": response.usage.completion_tokens,
                        "total_tokens": response.usage.total_tokens
                    }
                }
                
            except Exception as e:
                logger.error(f"Agent thinking failed: {str(e)}")
                execution_trace.append({
                    "iteration": iteration,
                    "type": "error",
                    "error": str(e)
                })
                break
        
        # Max iterations reached
        return {
            "answer": "I apologize, but I couldn't complete the task within the iteration limit.",
            "iterations": iteration,
            "execution_trace": execution_trace,
            "error": "max_iterations_reached"
        }
    
    async def run(self, task: str) -> Dict[str, Any]:
        """
        Run the agent on a task
        
        Args:
            task: Task description
            
        Returns:
            Task result with execution details
        """
        return await self.think(task)
    
    def reset(self):
        """Reset agent memory"""
        self.memory.clear()

# Example tools
async def search_web(query: str) -> Dict[str, Any]:
    """Simulated web search tool"""
    return {
        "query": query,
        "results": [
            {"title": "Result 1", "snippet": "This is a search result"},
            {"title": "Result 2", "snippet": "Another search result"}
        ]
    }

async def calculate(expression: str) -> Dict[str, Any]:
    """Calculator tool"""
    try:
        result = eval(expression)
        return {"expression": expression, "result": result}
    except Exception as e:
        return {"error": str(e)}

async def get_current_time() -> Dict[str, Any]:
    """Get current time"""
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "timezone": "UTC"
    }

# Predefined tools
SEARCH_TOOL = Tool(
    name="search_web",
    description="Search the web for information",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query"
            }
        },
        "required": ["query"]
    },
    function=search_web
)

CALCULATOR_TOOL = Tool(
    name="calculate",
    description="Perform mathematical calculations",
    parameters={
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "Mathematical expression to evaluate"
            }
        },
        "required": ["expression"]
    },
    function=calculate
)

TIME_TOOL = Tool(
    name="get_current_time",
    description="Get the current time in UTC",
    parameters={
        "type": "object",
        "properties": {}
    },
    function=get_current_time
)

# Agent factory
def create_agent(
    agent_type: str = "general",
    tools: Optional[List[Tool]] = None
) -> Agent:
    """Create a pre-configured agent"""
    
    agent_configs = {
        "general": {
            "name": "General Assistant",
            "system_prompt": "You are a helpful AI assistant. Use the available tools to help answer questions and complete tasks.",
            "tools": tools or [CALCULATOR_TOOL, TIME_TOOL]
        },
        "researcher": {
            "name": "Research Agent",
            "system_prompt": "You are a research assistant. Use web search and analysis tools to find and synthesize information.",
            "tools": tools or [SEARCH_TOOL, CALCULATOR_TOOL]
        },
        "analyst": {
            "name": "Data Analyst",
            "system_prompt": "You are a data analyst. Use calculation and analysis tools to process data and provide insights.",
            "tools": tools or [CALCULATOR_TOOL]
        }
    }
    
    config = agent_configs.get(agent_type, agent_configs["general"])
    return Agent(**config)
