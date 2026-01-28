import express from 'express';
import TunnelService from '../services/TunnelService.js';

const router = express.Router();

/**
 * GET /api/tunnel/status
 * Get current tunnel status
 */
router.get('/status', async (req, res) => {
  try {
    const state = await TunnelService.getStateAsync();
    res.json(state);
  } catch (error) {
    console.error('Error getting tunnel status:', error);
    res.status(500).json({ error: 'Failed to get tunnel status' });
  }
});

/**
 * POST /api/tunnel/start
 * Start the tunnel
 */
router.post('/start', async (req, res) => {
  try {
    await TunnelService.enable();
    const state = await TunnelService.getStateAsync();
    res.json({ success: true, ...state });
  } catch (error) {
    console.error('Error starting tunnel:', error);
    res.status(500).json({ error: 'Failed to start tunnel' });
  }
});

/**
 * POST /api/tunnel/stop
 * Stop the tunnel
 */
router.post('/stop', async (req, res) => {
  try {
    TunnelService.disable();
    const state = await TunnelService.getStateAsync();
    res.json({ success: true, ...state });
  } catch (error) {
    console.error('Error stopping tunnel:', error);
    res.status(500).json({ error: 'Failed to stop tunnel' });
  }
});

/**
 * GET /api/tunnel/install
 * Get install command for cloudflared
 */
router.get('/install', async (req, res) => {
  try {
    const installed = await TunnelService.isInstalled();
    const command = TunnelService.getInstallCommand();
    res.json({
      installed,
      command,
      platform: process.platform,
    });
  } catch (error) {
    console.error('Error getting install info:', error);
    res.status(500).json({ error: 'Failed to get install info' });
  }
});

export default router;
