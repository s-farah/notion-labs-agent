## AI Chat Agent
A Cloudflare Worker that acts as the front-end logic of the MCP system, using Workers AI and Durable Objects to automate Slack messages, Notion updates, and scheduling flows.

## Overview
The AI Chat Agent is the front-end logic of the system. It listens to Slack messages or user input in the chatbot, interprets them through Workers AI (Llama 3.1 8B Instruct). It communicates with the MCP server to perform structured actions such as adding labs to Notion, scheduling tasks, and parsing Google Docs content. It interprets messages, manages conversation history, and coordinates tool execution between the AI model and the MCP server.

## Components
Chat Worker: Handles incoming messages, maintains conversation history, and manages AI message interpretation.
MCP Server Connection: Connects to the Durable Object–based MCP backend through a persistent Server-Sent Events (SSE) session.
Workers AI: Uses Llama 3.1 8B Instructed to process Slack messages, extract relevant parts, and calls MCP tools such as addLabItem, addScheduleItem, and parseSlackMessage.
Slack: Receives Slack message events and automatically triggers MCP tool calls to update Notion and schedule entries.
Durable Object: Provides persistence for conversation history and tool results workflows.

## Tech Stack
Cloudflare Workers
Cloudflare Workers AI (Llama 3.1 8B Instruct)
Model Context Protocol (MCP)
Durable Objects
TypeScript + Zod
