import BaseTrigger from '../BaseTrigger.js';
import ProcessManager from '../../../workflow/ProcessManager.js';
import TunnelService from '../../../services/TunnelService.js';

class WebhookListener extends BaseTrigger {
  static schema = {
    title: 'Webhook Listener',
    category: 'trigger',
    type: 'webhook-listener',
    icon: 'connect',
    description: 'This trigger node listens for incoming webhook requests and triggers the workflow when a request is received.',
    parameters: {
      webhookUrl: {
        type: 'string',
        inputType: 'readonly',
        value: '{{WEBHOOK_URL}}/webhook/{{WORKFLOWID}}',
        description: 'The unique webhook URL for this workflow',
      },
      method: {
        type: 'string',
        inputType: 'select',
        options: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'],
        description: 'The HTTP method to accept',
      },
      authType: {
        type: 'string',
        inputType: 'select',
        options: ['None', 'Basic', 'Bearer', 'Webhook'],
        description: 'The type of authentication',
      },
      authToken: {
        type: 'string',
        inputType: 'text',
        description: 'Authentication token for Bearer or Webhook authentication',
        conditional: {
          field: 'authType',
          value: ['Bearer', 'Webhook'],
        },
      },
      username: {
        type: 'string',
        inputType: 'text',
        description: 'Username for Basic authentication',
        conditional: {
          field: 'authType',
          value: 'Basic',
        },
      },
      password: {
        type: 'string',
        inputType: 'password',
        description: 'Password for Basic authentication',
        conditional: {
          field: 'authType',
          value: 'Basic',
        },
      },
      responseMode: {
        type: 'string',
        inputType: 'select',
        options: ['Immediate', 'Wait for Result'],
        description: 'Whether to return 200 OK immediately or wait for the workflow to complete and return the result',
        default: 'Immediate',
      },
      responseBody: {
        type: 'string',
        inputType: 'codearea',
        description: 'Template for the response body. You can use variables from the workflow steps (e.g. {{stepName.output}}).',
        conditional: {
          field: 'responseMode',
          value: 'Wait for Result',
        },
      },
      responseContentType: {
        type: 'string',
        inputType: 'text',
        description: 'Content-Type header for the response (e.g. application/json)',
        default: 'application/json',
        conditional: {
          field: 'responseMode',
          value: 'Wait for Result',
        },
      },
    },
    outputs: {
      method: {
        type: 'string',
        description: 'The HTTP method of the received request',
      },
      headers: {
        type: 'object',
        description: 'The headers of the incoming request',
      },
      body: {
        type: 'object',
        description: 'The body of the incoming request',
      },
      query: {
        type: 'object',
        description: 'The query parameters of the incoming request',
      },
      params: {
        type: 'object',
        description: 'The route parameters of the incoming request',
      },
    },
  };

  constructor() {
    super('webhook-listener');
    this.webhookUrl = null;
  }

  async setup(engine, node) {
    await super.setup(engine, node);

    try {
      const { method, authType, authToken, username, password, responseMode, responseBody, responseContentType } = node.parameters;
      this.webhookUrl = await ProcessManager.WebhookReceiver.registerWebhook(
        engine.workflowId,
        engine.userId,
        method,
        authType,
        authToken,
        username,
        password,
        responseMode || 'Immediate',
        responseBody,
        responseContentType
      );

      // Check tunnel status and log appropriate message
      const tunnelUrl = TunnelService.getUrl();
      if (tunnelUrl) {
        console.log(`[Webhook Listener] ✓ Workflow ${engine.workflowId} ready for instant webhooks`);
        console.log(`[Webhook Listener]   URL: ${this.webhookUrl}`);
      } else {
        console.warn(`[Webhook Listener] ⚠ Workflow ${engine.workflowId} using polling mode (10s delay)`);
        console.warn(`[Webhook Listener]   URL: ${this.webhookUrl}`);
        console.warn(`[Webhook Listener]   TIP: Enable Instant Webhooks in Settings > Tunnel for <500ms delivery`);
      }
    } catch (error) {
      console.error(`Error setting up webhook listener: ${error.message}`);
      engine._updateNodeError(node.id, error.message);
      await engine._updateWorkflowStatus('error');
      engine.emit('workflowError', {
        globalError: error.message,
        nodeErrors: engine.errors,
      });
      throw error;
    }
  }

  async validate(triggerData) {
    return triggerData.type === 'webhook';
  }

  async process(inputData) {
    return {
      method: inputData.method,
      headers: inputData.headers,
      body: inputData.body,
      query: inputData.query,
      params: inputData.params,
    };
  }

  async teardown() {
    // Webhook cleanup is handled by ProcessManager
    await super.teardown();
  }
}

export default new WebhookListener();
