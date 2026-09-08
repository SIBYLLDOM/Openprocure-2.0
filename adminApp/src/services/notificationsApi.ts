import api from './api';

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  message: string | null;
  relatedType: string | null;
  relatedId: number | null;
  isRead: boolean;
  createdAt: string;
}

export const getNotifications = () =>
  api.get('/notifications').then((r) => r.data as { success: boolean; data: NotificationRow[]; unreadCount: number });

export const markNotificationRead = (id: number) =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data as { success: boolean });

export const markAllNotificationsRead = () =>
  api.post('/notifications/read-all').then((r) => r.data as { success: boolean });
