import { Router } from 'express';
import { productsRouter } from './products.router.js';
import { productionLinesRouter } from './production-lines.router.js';
import { machinesRouter } from './machines.router.js';
import { shiftsRouter } from './shifts.router.js';
import { defectTypesRouter } from './defect-types.router.js';

export const masterDataRouter = Router();

masterDataRouter.use('/products', productsRouter);
masterDataRouter.use('/production-lines', productionLinesRouter);
masterDataRouter.use('/machines', machinesRouter);
masterDataRouter.use('/shifts', shiftsRouter);
masterDataRouter.use('/defect-types', defectTypesRouter);
