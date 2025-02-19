<h1 align="center">
  <a href="(https://github.com/stephanbisser/agent-instructor">
    <img alt="Agent Istructor" src="./assets/Agent Instructor.jpeg" height="78">
  </a>
  <br>Agent Istructor<br>
</h1>

 **A VS Code extension to manage declarative agent instructions**

## Overview

The **Agent Istructor** extension helps you create and manage instructions for declarative agents. 
Currently it offers two functions:

**Analyze Instructions**:

This feature allows you to analyze an existing instruction of a declarative agent living within an instruction.txt file.

![Analyze Instructions](<assets/Agent Instructor Analysis.png>)

**Generate Instructions**:

This feature allows you to generate instructions for your declarative agent.

![Generate Instructions](<assets/Agent Instructor Generation 1.png>)

After you added your basic description, the extension will use an LLM to generate instructions and paste those into your instruction.txt file.

![Generate Instructions](<assets/Agent Instructor Generation 2.png>)

## Requirements

Before you can use this extension you need to configure the extension in your VS Code settings (File - Preferences - Settings - Agent Instructor Configuration). In the settings you need to fill in the following configuration settings:

- API Key
  - The API key for your LLM service.
- Endpoint Type
  - Choose the endpoint type: 'openai' for regular OpenAI or 'azure' for Azure OpenAI.
- Endpoint URL
  - The endpoint URL for your LLM API. For Azure OpenAI, provide the full URL (including deployment ID and API version). For OpenAI, leave blank to use the default endpoint.
- Max Tokens
  - Maximum number of tokens to generate in the response

![Settings](<assets/Agent Instructor Settings.png>)

## Release Notes

### 0.0.1

Initial preview release of the Agent Instructor VS Code extension

## Known Issues

If you encounter any issues please leave a new issue