import request from './request';

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

// ─── 日历 ─────────────────────────────────────────────────
export interface CalendarDay {
  day: number;
  date: string;
  hasEvent: boolean;
  open: boolean;
  full: boolean;
  past: boolean;
  isToday: boolean;
  registered: number;
  capacity: number;
  startTime: string;
}

export interface CalendarData {
  year: number;
  month: number;
  monthStr: string;
  prevMonth: string;
  nextMonth: string;
  firstWeekday: number;
  days: CalendarDay[];
}

export const getCalendar = (month?: string) =>
  request.get<unknown, ApiResponse<CalendarData>>('/calendar', { params: { month } });

// ─── 活动详情 ─────────────────────────────────────────────
export interface SlotInfo {
  teamNo: number;
  slotNo: number;
  name: string;
  phone: string;
  filled: boolean;
  stats?: { found: boolean; matches: number; kills: number; assists: number; kda: number } | null;
}

export interface TeamInfo {
  teamNo: number;
  slots: SlotInfo[];
}

export interface WaitlistEntry {
  name: string;
  phone: string;
}

export interface EventInfo {
  id: number;
  eventDate: string;
  open: boolean;
  teamCount: number;
  note: string;
  startTime: string;
  endTime: string;
  actualStart: string;
  actualEnd: string;
}

export interface EventDetailData {
  event: EventInfo;
  teams: TeamInfo[];
  waitlist: WaitlistEntry[];
  userPhone: string;
  userLoggedIn: boolean;
  gameNames: string[];
  pubgEnabled: boolean;
  registeredCount: number;
  capacity: number;
}

export const getEventDetail = (date: string) =>
  request.get<unknown, ApiResponse<EventDetailData>>(`/events/${date}`);

// ─── 报名 ─────────────────────────────────────────────────
export interface RegisterResult {
  name: string;
  maskedPhone: string;
  status: string;
  eventDate: string;
}

export const registerEvent = (date: string, data: { name: string }) =>
  request.post<unknown, ApiResponse<RegisterResult>>(`/events/${date}/register`, data);

// ─── 离队 ─────────────────────────────────────────────────
export interface LeaveResult {
  leftName: string;
  promotedName: string;
  eventDate: string;
}

export const leaveEvent = (date: string, data?: { phone?: string; password?: string }) =>
  request.post<unknown, ApiResponse<LeaveResult>>(`/events/${date}/leave`, data ?? {});

// ─── 管理员 ───────────────────────────────────────────────
export const adminLogin = (data: { username: string; password: string }) =>
  request.post<unknown, ApiResponse<{ username: string }>>('/admin/login', data);

export const adminLogout = () =>
  request.post<unknown, ApiResponse<null>>('/admin/logout');

export const adminCheck = () =>
  request.get<unknown, ApiResponse<{ loggedIn: boolean }>>('/admin/check');

// ─── 管理 - 活动 ──────────────────────────────────────────

export interface AdminEventRow {
  id: number;
  eventDate: string;
  open: boolean;
  teamCount: number;
  note: string;
  startTime: string;
  endTime: string;
  actualStart: string;
  actualEnd: string;
  createdAt: string;
  updatedAt: string;
  registeredCount: number;
  waitlistCount: number;
}

export const adminGetEvents = () =>
  request.get<unknown, ApiResponse<AdminEventRow[]>>('/admin/events');

export const adminCreateEvent = (data: {
  eventDate: string;
  teamCount: number;
  note: string;
  startTime: string;
  endTime: string;
  actualStart: string;
  actualEnd: string;
}) => request.post<unknown, ApiResponse<{ eventDate: string }>>('/admin/events', data);

export interface RankEntry {
  RegID: number;
  GameName: string;
  Matches: number;
  Kills: number;
  Deaths: number;
  Assists: number;
  TotalDamage: number;
  AvgDamage: number;
  KDA: number;
  Score: number;
  RankNo: number;
  RankLabel: string;
}

export interface AdminEventDetailData {
  event: EventInfo;
  registrations: {
    id: number;
    name: string;
    phone: string;
    status: string;
    teamNo: string;
    slotNo: string;
    createdAt: string;
  }[];
  teams: {
    teamNo: number;
    slots: { teamNo: number; slotNo: number; name: string; phone: string; filled: boolean }[];
  }[];
  waitlist: { name: string; phone: string }[];
  pubgEnabled: boolean;
  rankings?: RankEntry[];
}

export const adminGetEventDetail = (date: string) =>
  request.get<unknown, ApiResponse<AdminEventDetailData>>(`/admin/events/${date}`);

export const adminUpdateEvent = (date: string, data: {
  teamCount: number;
  note: string;
  startTime: string;
  endTime: string;
  actualStart: string;
  actualEnd: string;
}) => request.put<unknown, ApiResponse<null>>(`/admin/events/${date}`, data);

export const adminToggleEvent = (date: string) =>
  request.post<unknown, ApiResponse<null>>(`/admin/events/${date}/toggle`);

export const adminClearEvent = (date: string) =>
  request.post<unknown, ApiResponse<null>>(`/admin/events/${date}/clear`);

export const adminDeleteEvent = (date: string) =>
  request.delete<unknown, ApiResponse<null>>(`/admin/events/${date}`);

export const adminRefreshRankings = (date: string) =>
  request.post<unknown, ApiResponse<{ msg: string }>>(`/admin/events/${date}/refresh-rankings`);

// ─── 管理 - 用户 ──────────────────────────────────────────

export interface AdminUserRow {
  id: number;
  phone: string;
  createdAt: string;
  gameNames: string[];
  regCount: number;
}

export const adminGetUsers = () =>
  request.get<unknown, ApiResponse<AdminUserRow[]>>('/admin/users');

export interface AdminUserDetail {
  user: {
    id: number;
    phone: string;
    createdAt: string;
    gameNames: string[];
  };
  regHistory: {
    eventDate: string;
    name: string;
    status: string;
    createdAt: string;
  }[];
}

export const adminGetUser = (id: number) =>
  request.get<unknown, ApiResponse<AdminUserDetail>>(`/admin/users/${id}`);

export const adminUpdateUser = (id: number, data: {
  phone: string;
  deleteGameNames: string[];
  newGameName: string;
}) => request.put<unknown, ApiResponse<null>>(`/admin/users/${id}`, data);

export const adminDeleteUser = (id: number) =>
  request.delete<unknown, ApiResponse<null>>(`/admin/users/${id}`);

export const adminResetPassword = (id: number, newPassword: string) =>
  request.post<unknown, ApiResponse<{ msg: string }>>(`/admin/users/${id}/reset-password`, { newPassword });

// ─── 用户账号（前台） ──────────────────────────────────────────────────────────

export interface UserMeData {
  loggedIn: boolean;
  phone: string;
  gameNames: string[];
}

export const userLogin = (data: { phone: string; password: string }) =>
  request.post<unknown, ApiResponse<UserMeData>>('/user/login', data);

export const userLogout = () =>
  request.post<unknown, ApiResponse<null>>('/user/logout');

export const userMe = () =>
  request.get<unknown, ApiResponse<UserMeData>>('/user/me');

// ─── 战绩查询 ─────────────────────────────────────────────────────────────────

export interface PlayerStatsOverview {
  accountId: string;
  playerName: string;
  seasonId: string;
  matches: number;
  kills: number;
  deaths: number;
  assists: number;
  totalDamage: number;
  avgDamage: number;
  kda: number;
  recentMatchIds: string[];
}

export interface MatchParticipantDetail {
  name: string;
  kills: number;
  assists: number;
  dbnos: number;
  damage: number;
  survived: boolean;
  timeSurvived: number;
  walkDistance: number;
  rideDistance: number;
  heals: number;
  boosts: number;
  revives: number;
  headshotKills: number;
  winPlace: number;
}

export interface MatchDetail {
  matchId: string;
  createdAt: string;
  gameMode: string;
  mapName: string;
  duration: number;
  playerRank: number;
  totalTeams: number;
  totalPlayers: number;
  player: MatchParticipantDetail;
  teammates: MatchParticipantDetail[];
}

export const getPlayerStats = (name: string, season?: string) =>
  request.get<unknown, ApiResponse<PlayerStatsOverview>>(`/stats/player/${encodeURIComponent(name)}`, {
    params: season ? { season } : undefined,
  });

export interface SeasonInfo {
  id: string;
  isCurrentSeason: boolean;
}

export const getSeasons = () =>
  request.get<unknown, ApiResponse<SeasonInfo[]>>('/stats/seasons');

export const getMatchDetail = (matchId: string, playerName: string) =>
  request.get<unknown, ApiResponse<MatchDetail>>(`/stats/match/${matchId}`, { params: { player: playerName } });
