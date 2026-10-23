import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  AssignUserRolesRequestSchema,
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  UserListQuerySchema,
} from '@qualityops/contracts';
import { userService } from '../modules/users/user.service.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { BadRequestError } from '../middleware/error.middleware.js';

export const usersRouter = Router();

// All user management routes require authentication and the ADMIN role
usersRouter.use(authenticate);
usersRouter.use(requireRole(['ADMIN']));

// GET /api/v1/users - List users with pagination and filtering
usersRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = UserListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Invalid query parameters', parsed.error.issues);
    }

    const result = await userService.listUsers(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users - Admin provision a new user
usersRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = CreateUserRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.issues);
    }

    const user = await userService.createUser(parsed.data);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/:id - Get user by ID
usersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await userService.getUserById(req.params.id as string);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/users/:id - Update user details or status
usersRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateUserRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const user = await userService.updateUser(req.params.id as string, parsed.data, req.user!.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/users/:id/roles - Assign / replace roles
usersRouter.put(
  '/:id/roles',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AssignUserRolesRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const user = await userService.assignRoles(
        req.params.id as string,
        parsed.data.roles,
        req.user!.id,
      );
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);
