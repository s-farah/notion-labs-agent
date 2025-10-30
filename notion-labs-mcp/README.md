## MCP Server
A Durable Object–based Model Context Protocol (MCP) server built on Cloudflare Workers that performes AI tool calls to Notion, Google Docs, and Slack parsing.

## Overview
The MCP Server extends the McpAgent class, which is built on top of Cloudflare Durable Objects. Each instance acts as a persistent execution environment for AI tool calls, allowing consistency across requests. It receives structured requests from the AI Chat Agent, executes registered tools, and returns standardized responses.

## Components
Tools: Defines and exposes structured MCP tools such as addLabItem, addScheduleItem, parseSlackMessage, and parseGoogleDoc using Zod schemas for strong type validation and reliable execution.
Workers AI: Uses Llama 3.1 8B Instruct to normalize Slack messages, extracting lab details, due dates, and titles before structured parsing.
Notion API: Updates to Notion like adding schedule items and lab entries.
Google Docs Parsing: Extract document titles, summaries, and embedded links.
AI-Assisted Pipeline: Cleans and standardizes Slack messages before tool execution.
Schema Validation – Uses Zod to validate inputs and outputs for all tools. 

##  Stack
Cloudflare Workers and Durable Objects
Cloudflare Workers AI (Llama 3.1 8B Instruct)
Model Context Protocol (MCP)
Notion API
Google Docs API 
Slack API
TypeScript + Zod
