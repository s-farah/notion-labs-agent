# notion-labs-agent

A Cloudflare-based multi-agent system that integrates the Model Context Protocol (MCP) framework with Workers AI to automate Slack, Notion, and Google Docs workflows.

## Overview

This project unifies several Cloudflare MCP components into a single distributed architecture.  
The agent layer listens to Slack events, interprets them with Workers AI (Llama 3), and coordinates with an MCP server built on Durable Objects.  
The MCP server executes tool calls to the Notion API and Google Docs API, transforming unstructured input into structured, persistent knowledge.

## Architecture

- **notion-labs-agent/** – Cloudflare MCP agent that receives Slack messages, streams model responses, and issues tool calls through MCP.  
- **notion-labs-mcp/** – Durable Object–based MCP server that connects to external services (Notion, Google Docs) and handles AI normalization tasks.

## Features

- **Cloudflare MCP Integration** – Implements multiple MCP tools with structured schemas using Zod, enabling precise model-to-API communication.  
- **Workers AI Inference** – Uses Llama 3 8B Instruct to normalize Slack messages and extract entities such as lab numbers, titles, and due dates.  
- **Automated Notion API Sync** – Creates and updates database entries and toggle blocks in Notion for labs and schedules with rich text, multi-select tags, and date objects.  
- **Google Docs API Parsing** – Authenticates via a signed JWT using a Google Service Account to retrieve document titles, summaries, headings, and embedded links.  
- **Durable Object Persistence** – Maintains conversation context and tool state across requests, enabling reliable multi-step AI workflows.  
- **Unified AI Tooling** – Extends Cloudflare’s MCP interface so agents can invoke AI, Notion, and Google Docs tools within the same execution graph.

## Tech Stack

- Cloudflare Workers and Durable Objects  
- Cloudflare Workers AI (Llama 3 8B Instruct)  
- Model Context Protocol (MCP)  
- Notion API  
- Google Docs API  
- TypeScript + Zod
