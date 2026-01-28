# Instant Webhooks Guide (Local Tunnel)

Instant Webhooks allow AGNT to receive webhook triggers instantly (<500ms) on your local machine using **Cloudflare Quick Tunnels**. This eliminates the default 10-second polling delay and provides a more responsive experience for interactive workflows.

## Features
- **Zero Latency**: Direct path from the internet to your local AGNT instance.
- **Zero Configuration**: No Cloudflare account, tokens, or sign-up required.
- **Privacy**: The tunnel is created on-demand and exists only while enabled.

## Requirements
To use Instant Webhooks, you must have `cloudflared` installed on your machine.

### Installation
If you don't have it installed, AGNT will provide an installation command in the settings.
- **macOS (Homebrew)**: `brew install cloudflared`
- **Linux**: Follow the instructions on the [Cloudflare documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).

## Enabling Instant Webhooks
1.  Navigate to **Settings** -> **Webhooks**.
2.  If `cloudflared` is not installed, follow the installation instructions displayed.
3.  Toggle **Enable Instant Webhooks** to "On".
4.  Once connected, you will see a **Tunnel URL** (e.g., `https://random-words.trycloudflare.com`).

> [!NOTE]
> The Tunnel URL changes every time the tunnel is restarted or AGNT is rebooted.

## Using Instant Webhooks in Workflows
When creating or editing a workflow with a **Webhook Listener** trigger, you can now choose which URL to use.

### URL Selection
In the **Webhook Listener** node parameters:
1.  **Webhook Url Type**: Select between:
    - **AGNT Cloud (Default)**: Uses the standard `api.agnt.gg` URL. Requires 10s polling.
    - **Local Tunnel**: Uses your active Cloudflare Tunnel URL. Provides instant triggers.

2.  **Webhook Url**: This field will automatically update based on your selection.

> [!IMPORTANT]
> If you select **Local Tunnel** but the tunnel is disconnected in Settings, the workflow will not receive triggers until the tunnel is re-enabled.

## Troubleshooting
- **Tunnel Disconnected**: Check your internet connection and ensure `cloudflared` is not being blocked by a firewall.
- **Workflow not triggering**: Verify that the external service is sending requests to the correct URL displayed in the Webhook Listener node.
- **URL Changed**: If AGNT restarts, your Tunnel URL will change. You must update the external service (e.g., GitHub, Stripe, Zapier) with the new URL.
