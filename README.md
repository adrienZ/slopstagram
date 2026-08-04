# Slopstagram

## Prerequisites

Install [Ollama](https://ollama.com/)

Then install 2 models

```bash
ollama pull qwen3.5:0.8b-mlx
ollama pull minicpm-v4.6:latest
```

## Setup

```bash
npm install
```

Authenticate in a persistent Playwright session:

```bash
npm run auth
```

Complete the Instagram login in the opened browser, Then close the browser.

## Usage

Create report:

```bash
npm run create:report
```