import express from 'express';
import { prisma } from '../lib/prisma.js';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all initiatives (with filtering)
router.get('/', async (req, res, next) => {
  try {
    const { status, priority, parentId, search, canvasId, isStandaloneTask, type, lean } = req.query;

    const where = { createdById: req.user.id };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (isStandaloneTask === 'true') where.isStandaloneTask = true;
    if (isStandaloneTask === 'false') where.isStandaloneTask = false;

    // Canvas filter: when canvasId is given and no parentId filter (flat fetch for mind map),
    // include the canvas items AND all their descendants (children lack canvasId on their own).
    if (canvasId === 'null') {
      where.canvasId = null;
    } else if (canvasId && !parentId) {
      // Fetch canvas root items first, then collect all descendant IDs
      const rootItems = await prisma.initiative.findMany({
        where: { canvasId, createdById: req.user.id },
        select: { id: true },
      });
      if (rootItems.length === 0) {
        return res.json([]);
      }
      // BFS to collect all descendant IDs
      const allIds = new Set(rootItems.map(r => r.id));
      const queue = [...allIds];
      while (queue.length) {
        const batch = queue.splice(0, queue.length);
        const children = await prisma.initiative.findMany({
          where: { parentId: { in: batch }, createdById: req.user.id },
          select: { id: true },
        });
        children.forEach(c => {
          if (!allIds.has(c.id)) {
            allIds.add(c.id);
            queue.push(c.id);
          }
        });
      }
      where.id = { in: [...allIds] };
    } else if (canvasId) {
      where.canvasId = canvasId;
    }

    // If parentId is provided, filter by it; if 'null', get root items
    if (parentId === 'null') {
      where.parentId = null;
    } else if (parentId) {
      where.parentId = parentId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const initiatives = await prisma.initiative.findMany({
      where,
      ...(lean === 'true'
        ? {
            select: {
              id: true, title: true, status: true, priority: true,
              dueDate: true, type: true, isStandaloneTask: true,
            },
          }
        : {
            include: {
              createdBy: { select: { id: true, name: true, email: true, avatar: true } },
              assignees:  { select: { id: true, name: true, email: true, avatar: true } },
              linkedInitiative: { select: { id: true, title: true } },
              _count: { select: { children: true, comments: true, links: true } },
            },
          }),
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(initiatives);
  } catch (error) {
    next(error);
  }
});

// Bulk reorder: PATCH /initiatives/reorder
// Body: { items: [{ id, sortOrder }] }
router.patch('/reorder', async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }
    
    // Verify ownership of all items before updating
    const itemIds = items.map(i => i.id);
    const existingItems = await prisma.initiative.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, createdById: true }
    });
    
    for (const item of existingItems) {
      if (item.createdById !== req.user.id) {
        return res.status(403).json({ error: 'Cannot reorder items you do not own' });
      }
    }
    
    await Promise.all(
      items.map(({ id, sortOrder }) =>
        prisma.initiative.update({ where: { id }, data: { sortOrder } })
      )
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Get single initiative with details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        assignees: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        parent: {
          select: {
            id: true,
            title: true
          }
        },
        children: {
          include: {
            assignees: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            },
            _count: {
              select: {
                children: true
              }
            }
          }
        },
        links: true,
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        _count: {
          select: {
            children: true,
            comments: true,
            links: true
          }
        }
      }
    });

    if (!initiative) {
      return res.status(404).json({ error: 'Initiative not found' });
    }

    // Verify ownership (user must be the creator OR an assignee)
    const isCreator = initiative.createdById === req.user.id;
    const isAssignee = initiative.assignees.some(a => a.id === req.user.id);
    if (!isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(initiative);
  } catch (error) {
    next(error);
  }
});

// Create new initiative
router.post('/',
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('type').optional().isIn(['INITIATIVE', 'TASK', 'SUBTASK']),
  body('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  body('priority').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        title,
        description,
        type,
        parentId,
        status,
        priority,
        startDate,
        dueDate,
        tags,
        assigneeIds,
        canvasId,
        isStandaloneTask,
        linkedInitiativeId
      } = req.body;

      const data = {
        title,
        description,
        type: type || 'INITIATIVE',
        status: status || 'OPEN',
        priority: priority || 'MEDIUM',
        createdById: req.user.id,
        ...(parentId && { parentId }),
        ...(canvasId && { canvasId }),
        ...(isStandaloneTask !== undefined && { isStandaloneTask: Boolean(isStandaloneTask) }),
        ...(linkedInitiativeId && { linkedInitiativeId }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(tags && { tags })
      };

      if (assigneeIds && assigneeIds.length > 0) {
        data.assignees = {
          connect: assigneeIds.map(id => ({ id }))
        };
      }

      const initiative = await prisma.initiative.create({
        data,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          },
          assignees: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          }
        }
      });

      // Create activity log
      await prisma.activityLog.create({
        data: {
          action: 'created',
          initiativeId: initiative.id,
          userId: req.user.id,
          changes: { title, type, status, priority }
        }
      });

      res.status(201).json(initiative);
    } catch (error) {
      next(error);
    }
  }
);

// Update initiative
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      startDate,
      dueDate,
      progress,
      tags,
      assigneeIds,
      positionX,
      positionY
    } = req.body;

    const existing = await prisma.initiative.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Initiative not found' });
    }
    
    // Verify ownership
    if (existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) {
      data.status = status;
      if (status === 'COMPLETED' && !existing.completedAt) {
        data.completedAt = new Date();
        data.progress = 100;
      }
    }
    if (priority !== undefined) data.priority = priority;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (progress !== undefined) data.progress = Math.min(100, Math.max(0, progress));
    if (tags !== undefined) data.tags = tags;
    if (positionX !== undefined) data.positionX = positionX;
    if (positionY !== undefined) data.positionY = positionY;
    if ('canvasId' in req.body) data.canvasId = req.body.canvasId || null;
    if ('linkedInitiativeId' in req.body) data.linkedInitiativeId = req.body.linkedInitiativeId || null;
    if ('isStandaloneTask' in req.body) data.isStandaloneTask = Boolean(req.body.isStandaloneTask);
    if ('jiraTicketId' in req.body) data.jiraTicketId = req.body.jiraTicketId || null;
    if ('jiraTicketUrl' in req.body) data.jiraTicketUrl = req.body.jiraTicketUrl || null;
    if ('jiraTicketData' in req.body) data.jiraTicketData = req.body.jiraTicketData || null;

    if (assigneeIds !== undefined) {
      data.assignees = {
        set: assigneeIds.map(id => ({ id }))
      };
    }

    const initiative = await prisma.initiative.update({
      where: { id },
      data,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        assignees: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    // Log changes
    const changes = {};
    Object.keys(data).forEach(key => {
      if (existing[key] !== data[key]) {
        changes[key] = { from: existing[key], to: data[key] };
      }
    });

    if (Object.keys(changes).length > 0) {
      await prisma.activityLog.create({
        data: {
          action: 'updated',
          initiativeId: id,
          userId: req.user.id,
          changes
        }
      });
    }

    res.json(initiative);
  } catch (error) {
    next(error);
  }
});

// Delete initiative
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        _count: {
          select: { children: true }
        }
      }
    });

    if (!initiative) {
      return res.status(404).json({ error: 'Initiative not found' });
    }
    
    // Verify ownership
    if (initiative.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete will cascade to children
    await prisma.initiative.delete({
      where: { id }
    });

    res.json({ message: 'Initiative deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Update status
router.patch('/:id/status',
  body('status').isIn(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Verify ownership first
      const initiative = await prisma.initiative.findUnique({ where: { id } });
      if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
      if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const data = { status };
      if (status === 'COMPLETED') {
        data.completedAt = new Date();
        data.progress = 100;
      }

      const updated = await prisma.initiative.update({
        where: { id },
        data,
        include: {
          assignees: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        }
      });

      await prisma.activityLog.create({
        data: {
          action: 'status_changed',
          initiativeId: id,
          userId: req.user.id,
          changes: { status }
        }
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

// Update priority
router.patch('/:id/priority',
  body('priority').isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;
      
      // Verify ownership first
      const initiative = await prisma.initiative.findUnique({ where: { id } });
      if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
      if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const updated = await prisma.initiative.update({
        where: { id },
        data: { priority },
        include: {
          assignees: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        }
      });

      await prisma.activityLog.create({
        data: {
          action: 'priority_changed',
          initiativeId: id,
          userId: req.user.id,
          changes: { priority }
        }
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

// Update position (for mind map drag)
router.patch('/:id/position', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { positionX, positionY } = req.body;
    
    // Verify ownership first
    const initiative = await prisma.initiative.findUnique({ where: { id } });
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.initiative.update({
      where: { id },
      data: { positionX, positionY }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ─── Links ────────────────────────────────────────────────────────────────────

// GET /initiatives/:id/links
router.get('/:id/links', async (req, res, next) => {
  try {
    // Verify ownership of the initiative
    const initiative = await prisma.initiative.findUnique({
      where: { id: req.params.id },
      select: { createdById: true }
    });
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    const links = await prisma.link.findMany({
      where: { initiativeId: req.params.id },
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(links);
  } catch (error) { next(error); }
});

// POST /initiatives/:id/links
router.post('/:id/links',
  body('url').trim().notEmpty().withMessage('URL is required'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      
      // Verify ownership of the initiative
      const initiative = await prisma.initiative.findUnique({
        where: { id: req.params.id },
        select: { createdById: true }
      });
      if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
      if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const { url, title, description, category, tags } = req.body;
      const link = await prisma.link.create({
        data: {
          url,
          title: title || null,
          description: description || null,
          category: category || null,
          tags: tags || [],
          initiativeId: req.params.id,
          createdById: req.user.id
        },
        include: { createdBy: { select: { id: true, name: true, avatar: true } } }
      });

      await prisma.activityLog.create({
        data: { action: 'link_added', initiativeId: req.params.id, userId: req.user.id, changes: { url, title } }
      });

      res.status(201).json(link);
    } catch (error) { next(error); }
  }
);

// PUT /links/:linkId
router.put('/links/:linkId', async (req, res, next) => {
  try {
    const { url, title, description, category, tags } = req.body;
    
    // Verify ownership of the link
    const link = await prisma.link.findUnique({ where: { id: req.params.linkId } });
    if (!link) return res.status(404).json({ error: 'Link not found' });
    if (link.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    const data = {};
    if (url !== undefined) data.url = url;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (tags !== undefined) data.tags = tags;

    const updated = await prisma.link.update({
      where: { id: req.params.linkId },
      data,
      include: { createdBy: { select: { id: true, name: true, avatar: true } } }
    });
    res.json(updated);
  } catch (error) { next(error); }
});

// DELETE /links/:linkId
router.delete('/links/:linkId', async (req, res, next) => {
  try {
    // Verify ownership of the link
    const link = await prisma.link.findUnique({ where: { id: req.params.linkId } });
    if (!link) return res.status(404).json({ error: 'Link not found' });
    if (link.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    await prisma.link.delete({ where: { id: req.params.linkId } });
    res.json({ message: 'Link deleted' });
  } catch (error) { next(error); }
});

// ─── Comments ─────────────────────────────────────────────────────────────────

// GET /initiatives/:id/comments
router.get('/:id/comments', async (req, res, next) => {
  try {
    // Verify ownership of the initiative
    const initiative = await prisma.initiative.findUnique({
      where: { id: req.params.id },
      select: { createdById: true }
    });
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    const comments = await prisma.comment.findMany({
      where: { initiativeId: req.params.id },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(comments);
  } catch (error) { next(error); }
});

// POST /initiatives/:id/comments
router.post('/:id/comments',
  body('content').trim().notEmpty().withMessage('Content is required'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      
      // Verify ownership of the initiative
      const initiative = await prisma.initiative.findUnique({
        where: { id: req.params.id },
        select: { createdById: true }
      });
      if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
      if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const comment = await prisma.comment.create({
        data: { content: req.body.content, initiativeId: req.params.id, userId: req.user.id },
        include: { user: { select: { id: true, name: true, avatar: true } } }
      });

      await prisma.activityLog.create({
        data: { action: 'comment_added', initiativeId: req.params.id, userId: req.user.id, changes: { content: req.body.content } }
      });

      res.status(201).json(comment);
    } catch (error) { next(error); }
  }
);

// PUT /comments/:commentId
router.put('/comments/:commentId', async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.comment.update({
      where: { id: req.params.commentId },
      data: { content: req.body.content },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });
    res.json(updated);
  } catch (error) { next(error); }
});

// DELETE /comments/:commentId
router.delete('/comments/:commentId', async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await prisma.comment.delete({ where: { id: req.params.commentId } });
    res.json({ message: 'Comment deleted' });
  } catch (error) { next(error); }
});

// ─── Activity Log ─────────────────────────────────────────────────────────────

// GET /initiatives/:id/activity
router.get('/:id/activity', async (req, res, next) => {
  try {
    // Verify ownership of the initiative
    const initiative = await prisma.initiative.findUnique({
      where: { id: req.params.id },
      select: { createdById: true }
    });
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    if (initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    const logs = await prisma.activityLog.findMany({
      where: { initiativeId: req.params.id },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { timestamp: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error) { next(error); }
});

// ─── Children ─────────────────────────────────────────────────────────────────

// Get children of an initiative
router.get('/:id/children', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Verify ownership of parent initiative
    const parent = await prisma.initiative.findUnique({
      where: { id },
      select: { createdById: true }
    });
    if (!parent) return res.status(404).json({ error: 'Initiative not found' });
    if (parent.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const children = await prisma.initiative.findMany({
      where: { parentId: id, createdById: req.user.id },
      include: {
        assignees: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        _count: {
          select: {
            children: true,
            comments: true
          }
        }
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(children);
  } catch (error) {
    next(error);
  }
});

export default router;
