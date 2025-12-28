import { prisma } from "../lib/prisma.js";
import logger from "../utils/logger.js";
import { TaskStatus } from "../generated/prisma/client.js";

/**
 * TaskService - Handles task creation, listing, updating, and management
 */
export interface TaskDto {
  id: string;
  taskId: number;
  chatId: string;
  senderId: string | null;
  title: string;
  assignedTo: string[];
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  chatId: string;
  senderId?: string;
  title: string;
  assignedTo?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  assignedTo?: string[];
  status?: TaskStatus;
}

export class TaskService {
  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<TaskDto> {
    try {
      const task = await prisma.tasks.create({
        data: {
          chatId: input.chatId,
          senderId: input.senderId || null,
          title: input.title,
          assignedTo: input.assignedTo || [],
          status: TaskStatus.Pending,
        },
      });

      logger.info("Task created", {
        taskId: task.id,
        taskNumber: task.taskId,
        chatId: input.chatId,
        assignedCount: input.assignedTo?.length || 0,
      });
      return this.toTaskDto(task);
    } catch (error) {
      logger.error("Failed to create task", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        chatId: input.chatId,
      });
      throw new Error("Failed to create task");
    }
  }

  /**
   * List tasks for a specific chat
   */
  async listTasks(
    chatId: string,
    status?: TaskStatus | "all",
    assignedTo?: string
  ): Promise<TaskDto[]> {
    try {
      const whereClause: any = { chatId };

      if (status && status !== "all") {
        whereClause.status = status;
      }

      if (assignedTo) {
        whereClause.assignedTo = {
          has: assignedTo,
        };
      }

      const tasks = await prisma.tasks.findMany({
        where: whereClause,
        orderBy: [
          { taskId: "asc" }, // Pending first, then Done, then Cancelled
        ],
      });

      return tasks.map(this.toTaskDto);
    } catch (error) {
      logger.error("Failed to list tasks", {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        status,
      });
      throw new Error("Failed to list tasks");
    }
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId: string): Promise<TaskDto | null> {
    try {
      const task = await prisma.tasks.findUnique({
        where: { id: taskId },
      });

      return task ? this.toTaskDto(task) : null;
    } catch (error) {
      logger.error("Failed to get task", {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
      return null;
    }
  }

  /**
   * Get a task by taskId (the auto-increment number)
   */
  async getTaskByNumber(
    taskNumber: number,
    chatId: string
  ): Promise<TaskDto | null> {
    try {
      const task = await prisma.tasks.findFirst({
        where: {
          taskId: taskNumber,
          chatId: chatId,
        },
      });

      return task ? this.toTaskDto(task) : null;
    } catch (error) {
      logger.error("Failed to get task by number", {
        error: error instanceof Error ? error.message : String(error),
        taskNumber,
        chatId,
      });
      return null;
    }
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
    try {
      const updateData: any = {};

      if (input.title !== undefined) {
        updateData.title = input.title;
      }
      if (input.assignedTo !== undefined) {
        updateData.assignedTo = input.assignedTo;
      }
      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      const task = await prisma.tasks.update({
        where: { id: taskId },
        data: updateData,
      });

      logger.info("Task updated", {
        taskId: task.id,
        taskNumber: task.taskId,
        status: task.status,
      });
      return this.toTaskDto(task);
    } catch (error) {
      logger.error("Failed to update task", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        taskId,
      });
      throw new Error("Failed to update task");
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<TaskDto> {
    return this.updateTask(taskId, { status });
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      await prisma.tasks.delete({
        where: { id: taskId },
      });

      logger.info("Task deleted", { taskId });
      return true;
    } catch (error) {
      logger.error("Failed to delete task", {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
      return false;
    }
  }

  /**
   * Get tasks assigned to a specific user
   */
  async getTasksAssignedTo(chatId: string, userId: string): Promise<TaskDto[]> {
    try {
      const tasks = await prisma.tasks.findMany({
        where: {
          chatId,
          assignedTo: {
            has: userId,
          },
          // Don't filter by status here - let the caller decide
          // which statuses to include
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return tasks.map(this.toTaskDto);
    } catch (error) {
      logger.error("Failed to get tasks for user", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        chatId,
      });
      throw new Error("Failed to get tasks for user");
    }
  }

  /**
   * Get recently completed or cancelled tasks (last 7 days)
   */
  async getRecentClosedTasks(
    chatId: string,
    days: number = 7
  ): Promise<TaskDto[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const tasks = await prisma.tasks.findMany({
        where: {
          chatId,
          status: {
            in: [TaskStatus.Done, TaskStatus.Cancelled],
          },
          updatedAt: {
            gte: cutoffDate,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      return tasks.map(this.toTaskDto);
    } catch (error) {
      logger.error("Failed to get recent closed tasks", {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        days,
      });
      throw new Error("Failed to get recent closed tasks");
    }
  }

  /**
   * Get task statistics for a chat
   */
  async getTaskStats(chatId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    done: number;
    cancelled: number;
  }> {
    try {
      const [total, pending, inProgress, done, cancelled] = await Promise.all([
        prisma.tasks.count({ where: { chatId } }),
        prisma.tasks.count({ where: { chatId, status: TaskStatus.Pending } }),
        prisma.tasks.count({
          where: { chatId, status: TaskStatus.InProgress },
        }),
        prisma.tasks.count({ where: { chatId, status: TaskStatus.Done } }),
        prisma.tasks.count({ where: { chatId, status: TaskStatus.Cancelled } }),
      ]);

      return { total, pending, inProgress, done, cancelled };
    } catch (error) {
      logger.error("Failed to get task statistics", {
        error: error instanceof Error ? error.message : String(error),
        chatId,
      });
      throw new Error("Failed to get task statistics");
    }
  }

  /**
   * Clean up old completed/cancelled tasks
   */
  async cleanupOldTasks(
    chatId: string,
    olderThanDays: number = 30
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.tasks.deleteMany({
        where: {
          chatId,
          status: {
            in: [TaskStatus.Done, TaskStatus.Cancelled],
          },
          updatedAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info("Old tasks cleaned up", {
        count: result.count,
        chatId,
        olderThanDays,
      });
      return result.count;
    } catch (error) {
      logger.error("Failed to cleanup old tasks", {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        olderThanDays,
      });
      return 0;
    }
  }

  /**
   * Convert Prisma Task to TaskDto
   */
  private toTaskDto(task: any): TaskDto {
    return {
      id: task.id,
      taskId: task.taskId,
      chatId: task.chatId,
      senderId: task.senderId,
      title: task.title,
      assignedTo: task.assignedTo,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  /**
   * Format task ID for display (T1, T2, etc.)
   */
  formatTaskId(taskId: number): string {
    return `T${taskId}`;
  }

  /**
   * Get status emoji
   */
  getStatusEmoji(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.Pending:
        return "🟡";
      case TaskStatus.InProgress:
        return "🟠";
      case TaskStatus.Done:
        return "🟢";
      case TaskStatus.Cancelled:
        return "🔴";
      default:
        return "⬜";
    }
  }

  /**
   * Format task for display
   */
  formatTask(task: TaskDto, includeAssignees: boolean = true): string {
    const emoji = this.getStatusEmoji(task.status);
    const taskNumber = this.formatTaskId(task.taskId);

    let formatted = `${emoji} *${taskNumber}* - ${task.title}`;

    if (includeAssignees && task.assignedTo.length > 0) {
      formatted += `\n   👤 Assigned to: ${task.assignedTo.join(", ")}`;
    }

    return formatted;
  }
}

// Singleton instance
export const taskService = new TaskService();
