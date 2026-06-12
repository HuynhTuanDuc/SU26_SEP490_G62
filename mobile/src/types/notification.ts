export type NotificationType =
  | 'TRIP_ASSIGNED'
  | 'TRIP_QUEUED'
  | 'TRIP_STATUS_UPDATED'
  | 'ORDER_COMPLETED'
  | 'INCIDENT_REPORTED'
  | 'INCIDENT_FEEDBACK'
  | 'ADVANCE_APPROVED'
  | 'ADVANCE_REJECTED'
  | 'PAYSLIP_PUBLISHED'
  | 'MAINTENANCE_ASSIGNED'
  | 'MAINTENANCE_COMPLETED'
  | 'SYSTEM_ALERT';

export type AppNotification = {
  id: number | string;
  title: string;
  message: string;
  type: NotificationType | string;
  target_id: number | string | null;
  entity_type?: string | null;
  display_mode?: 'toast' | 'alert' | 'silent';
  is_read: boolean;
  created_at: string;
};

export type NotificationsResponse = {
  notifications: AppNotification[];
  unreadCount: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type NotificationEvent =
  | { type: 'notification.connected' }
  | { type: 'notification.created'; notification: AppNotification }
  | { type: 'maintenance.assigned'; vehicleId: number; maintenanceRecordId: number | null }
  | { type: 'maintenance.completed'; vehicleId: number; maintenanceRecordId: number }
  | { type: 'pong' };

export type MarkNotificationReadResponse = {
  notification: AppNotification;
};

export type NotificationDetailResponse = {
  notification: AppNotification;
};
