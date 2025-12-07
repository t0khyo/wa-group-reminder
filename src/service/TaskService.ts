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

      logger.info(
        `Created task ${task.id} (T-${task.taskId}) in chat ${input.chatId}`
      );
      return this.toTaskDto(task);
    } catch (error) {
      logger.error("Error creating task:", error);
      throw new Error("Failed to create task");
    }
  }

  /**
   * List tasks for a specific chat
   */
  async listTasks(
    chatId: string,
    status?: TaskStatus | "all"
  ): Promise<TaskDto[]> {
    try {
      const whereClause: any = { chatId };

      if (status && status !== "all") {
        whereClause.status = status;
      }

      const tasks = await prisma.tasks.findMany({
        where: whereClause,
        orderBy: [
          { taskId: "asc" }, // Pending first, then Done, then Cancelled
        ],
      });

      return tasks.map(this.toTaskDto);
    } catch (error) {
      logger.error(`Error listing tasks for chat ${chatId}:`, error);
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
      logger.error(`Error getting task ${taskId}:`, error);
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
      logger.error(`Error getting task #${taskNumber}:`, error);
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

      logger.info(`Updated task ${taskId} (T-${task.taskId})`);
      return this.toTaskDto(task);
    } catch (error) {
      logger.error(`Error updating task ${taskId}:`, error);
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

      logger.info(`Deleted task ${taskId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting task ${taskId}:`, error);
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
          status: TaskStatus.Pending,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return tasks.map(this.toTaskDto);
    } catch (error) {
      logger.error(`Error getting tasks for user ${userId}:`, error);
      throw new Error("Failed to get user tasks");
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
      logger.error(`Error getting task stats for chat ${chatId}:`, error);
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

      logger.info(`Cleaned up ${result.count} old tasks from chat ${chatId}`);
      return result.count;
    } catch (error) {
      logger.error(`Error cleaning up tasks for chat ${chatId}:`, error);
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
