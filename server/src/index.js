import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { requireAuth, csrfGuard } from './auth.js';
import { purgeExpiredInvoices } from './archive.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import matrixRoutes from './routes/matrices.js';
import categoryRoutes from './routes/categories.js';
import brandRoutes from './routes/brands.js';
import customerRoutes from './routes/customers.js';
import invoiceRoutes from './routes/invoices.js';
import vendorRoutes from './routes/vendors.js';
import receivingRoutes from './routes/receivings.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import returnRoutes from './routes/returns.js';
import roleRoutes from './routes/roles.js';
import userRoutes from './routes/users.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import brandingRoutes from './routes/branding.js';

const app = express();
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind nginx: real client IP for rate limiting
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"], // invoice PDF preview
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

const api = express.Router();
api.use(csrfGuard);
api.use('/auth', authRoutes);
api.use('/branding', brandingRoutes); // public: logos
api.use(requireAuth); // everything below needs a session
api.use('/dashboard', dashboardRoutes);
api.use('/products', productRoutes);
api.use('/matrices', matrixRoutes);
api.use('/categories', categoryRoutes);
api.use('/brands', brandRoutes);
api.use('/customers', customerRoutes);
api.use('/invoices', invoiceRoutes);
api.use('/vendors', vendorRoutes);
api.use('/receivings', receivingRoutes);
api.use('/purchase-orders', purchaseOrderRoutes);
api.use('/returns', returnRoutes);
api.use('/roles', roleRoutes);
api.use('/users', userRoutes);
api.use('/reports', reportRoutes);
api.use('/settings', settingsRoutes);
api.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, api);

// Frontend (built SPA).
app.use('/assets', express.static(path.join(WEB, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(WEB, { index: false, maxAge: '1h' }));
app.get('/', (req, res) => res.redirect('/admin'));
app.get(['/admin', '/admin/*'], (req, res) => res.sendFile(path.join(WEB, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
app.use((req, res) => res.status(404).send('Not found'));

// Errors: log details server-side, never leak stack traces to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON' });
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: req.path.includes('/logo/') ? 'Logo must be 1 MB or smaller' : 'Request too large' });
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`billing listening on 127.0.0.1:${config.port}`);
  // Every 5 minutes: email invoices older than the retention window to the archive address, then delete them.
  purgeExpiredInvoices();
  setInterval(purgeExpiredInvoices, 5 * 60 * 1000).unref();
});
