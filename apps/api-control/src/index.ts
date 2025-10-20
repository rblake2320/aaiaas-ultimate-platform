import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { env } from './config/env';
import { logger } from './utils/logger';
import { connectRedis } from './config/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { basicRateLimiter } from './middleware/rateLimiter';

// Routes
import authRoutes from './routes/auth';
import workflowRoutes from './routes/workflows';
import apiKeyRoutes from './routes/apiKeys';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN.split(','),
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(basicRateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'api-control',
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/workflows', workflowRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function start() {
  try {
    // Connect to Redis
    await connectRedis();
    logger.info('Connected to Redis');

    // Start HTTP server
    const PORT = parseInt(env.PORT);
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Control Plane API running on port ${PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`CORS Origin: ${env.CORS_ORIGIN}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

start();

export default app;
