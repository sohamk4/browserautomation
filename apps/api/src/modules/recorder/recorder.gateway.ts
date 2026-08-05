import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BrowserService } from '../browser/browser.service';
import { RecorderService } from './recorder.service';
import { forwardRef, Inject } from '@nestjs/common';

@WebSocketGateway({ cors: true })
export class RecorderGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private browserService: BrowserService,
    @Inject(forwardRef(() => RecorderService))  // <-- add forwardRef
    private recorderService: RecorderService,
  ) {}

  handleConnection(client: Socket): void {
    console.log('Recorder client connected:', client.id);
  }

  handleDisconnect(client: Socket): void {
    console.log('Recorder client disconnected:', client.id);
  }

  /**
   * Toggle extraction mode in the browser.
   * This requires an active recording session with a page.
   */
  @SubscribeMessage('toggleExtraction')
  async handleToggleExtraction(client: Socket): Promise<void> {
    try {
      console.log('extract')
      const sessionId = this.recorderService.getCurrentSessionId();
      if (!sessionId) {
        client.emit('error', 'No active recording session');
        return;
      }
      // Get the page associated with this session
      const page = this.browserService.getPageForSession(sessionId);
      if (!page) {
        client.emit('error', 'No page available for extraction');
        return;
      }
      // Toggle extraction mode by evaluating the global function
      await page.evaluate(() => {
        // The function is injected by recorder-init-script.ts
        if (typeof (window as any).toggleExtractionMode === 'function') {
          (window as any).toggleExtractionMode();
        } else {
          console.warn('toggleExtractionMode not available');
        }
      });
      client.emit('extractionToggled', { success: true });
    } catch (error) {
      client.emit('error', { message: error instanceof Error ? error.message : String(error) });
    }
  }

  broadcastStep(step: unknown): void {
    this.server.emit('step', step);
  }

  broadcastStatus(status: 'recording' | 'paused' | 'stopped'): void {
    this.server.emit('status', status);
  }
}