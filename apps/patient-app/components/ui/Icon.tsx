// token-guard:ignore-file (this file owns the native Lucide symbol primitives)
import React from 'react';
import { ColorValue } from 'react-native';
import {
  Home,
  Heart,
  Files,
  User,
  Users,
  Bell,
  BellRing,
  BellOff,
  Settings,
  Menu,
  LayoutGrid,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  MoreHorizontal,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  LogOut,
  Plus,
  Check,
  CheckCircle2,
  Pencil,
  Trash2,
  Share,
  Copy,
  Download,
  Upload,
  Archive,
  ArchiveRestore,
  Camera,
  ScanLine,
  Info,
  AlertTriangle,
  AlertCircle,
  Lock,
  LockOpen,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  WifiOff,
  Cloud,
  CloudOff,
  Calendar,
  Clock,
  Hospital,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  CreditCard,
  Folder,
  FolderPlus,
  FolderInput,
  File,
  FileText,
  Image as ImageIcon,
  FileType,
  QrCode,
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Activity,
  FlaskConical,
  ClipboardList,
  CheckSquare,
  Brain,
  Accessibility,
  Scissors,
  Briefcase,
  Plane,
  Sparkles,
  MessageSquare,
  Star,
  Tag,
  Monitor,
  Maximize2,
  Circle,
  type LucideIcon,
} from 'lucide-react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';
import { iconNames, type IconName } from './iconNames';
import { NATIVE_ICONS } from './iconRegistry';

export type { IconName } from './iconNames';

export interface IconProps {
  /** Semantic name (preferred). Mapped to soft-edge Lucide icons across all platforms. */
  name?: IconName | (string & {});
  /** Legacy explicit Material Symbol name (kept for existing call sites). */
  android?: string;
  /** Legacy explicit SF Symbol name (kept for existing call sites). */
  ios?: string;
  /** Semantic colour token or an explicit colour. Defaults to the brand primary. */
  color?: ColorToken | ColorValue;
  size?: number;
}

/** Unified soft-edge Lucide glyphs for every semantic icon name. */
const ICONS: Record<IconName, LucideIcon> = {
  home: Home,
  appointments: Heart,
  files: Files,
  profile: User,
  notifications: Bell,
  notificationsActive: BellRing,
  notificationsOff: BellOff,
  settings: Settings,
  menu: Menu,
  grid: LayoutGrid,
  back: ArrowLeft,
  forward: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  close: X,
  more: MoreHorizontal,
  search: Search,
  filter: Filter,
  sort: ArrowUpDown,
  refresh: RefreshCw,
  externalLink: ExternalLink,
  logout: LogOut,
  plus: Plus,
  check: Check,
  checkCircle: CheckCircle2,
  edit: Pencil,
  trash: Trash2,
  share: Share,
  copy: Copy,
  download: Download,
  upload: Upload,
  archive: Archive,
  camera: Camera,
  scan: ScanLine,
  fullscreen: Maximize2,
  info: Info,
  warning: AlertTriangle,
  alert: AlertCircle,
  lock: Lock,
  unlock: LockOpen,
  key: KeyRound,
  shield: ShieldCheck,
  eye: Eye,
  eyeOff: EyeOff,
  wifiOff: WifiOff,
  cloud: Cloud,
  cloudOff: CloudOff,
  sync: RefreshCw,
  calendar: Calendar,
  clock: Clock,
  hospital: Hospital,
  building: Building2,
  location: MapPin,
  phone: Phone,
  mail: Mail,
  globe: Globe,
  user: User,
  users: Users,
  badge: CreditCard,
  emergencyContact: AlertTriangle,
  folder: Folder,
  folderPlus: FolderPlus,
  folderMove: FolderInput,
  file: File,
  document: FileText,
  image: ImageIcon,
  pdf: FileType,
  qrCode: QrCode,
  stethoscope: Stethoscope,
  pill: Pill,
  syringe: Syringe,
  heartPulse: HeartPulse,
  activity: Activity,
  lab: FlaskConical,
  clipboard: ClipboardList,
  checklist: CheckSquare,
  brain: Brain,
  accessibility: Accessibility,
  vision: Eye,
  scissors: Scissors,
  briefcase: Briefcase,
  flight: Plane,
  family: Users,
  wellness: Sparkles,
  chat: MessageSquare,
  star: Star,
  tag: Tag,
  monitor: Monitor,
};

/**
 * Legacy android/ios symbol names resolve to the matching soft Lucide icon.
 */
const LEGACY_LOOKUP: Record<string, IconName> = {};
for (const key of iconNames) {
  const native = NATIVE_ICONS[key];
  LEGACY_LOOKUP[native.android.toLowerCase()] ??= key;
  LEGACY_LOOKUP[native.ios.toLowerCase()] ??= key;
}

/** Extra aliases for symbol names that appear across screens. */
const ALIASES: Record<string, IconName> = {
  chevron: 'forward',
  arrow_forward: 'forward',
  checkmark: 'check',
  xmark: 'close',
  pencil: 'edit',
  delete: 'trash',
  trash: 'trash',
  fullscreen: 'externalLink',
  'arrow.up.left.and.arrow.down.right': 'externalLink',
  unfold_more: 'chevronDown',
  'chevron.up.chevron.down': 'chevronDown',
  bell: 'notifications',
  gear: 'settings',
  quiz: 'checklist',
  science: 'lab',
  waveform: 'activity',
  pregnant_woman: 'activity',
  male: 'user',
  folder_open: 'folder',
  add: 'plus',
  'plus.circle': 'plus',
  'checkmark.circle': 'checkCircle',
  'exclamationmark.triangle': 'warning',
  'exclamationmark.circle': 'alert',
  unarchive: 'archive',
  heart_check: 'appointments',
};

function resolveIcon(name?: string, android?: string, ios?: string): LucideIcon {
  const keys = [name, android, ios].filter(Boolean).map((k) => String(k));
  for (const k of keys) {
    if (k in ICONS) return ICONS[k as IconName];
    const lower = k.toLowerCase();
    if (lower === 'unarchive') return ArchiveRestore;
    if (lower === 'fullscreen') return Maximize2;
    const hit = LEGACY_LOOKUP[lower] ?? ALIASES[lower];
    if (hit) return ICONS[hit];
  }
  return Circle;
}

export function AppIcon({ android, ios, name, color, size = 20 }: IconProps) {
  const theme = useAppTheme();
  const tokens = theme.colors as Record<string, string>;
  const resolved =
    typeof color === 'string' && color in tokens
      ? tokens[color]
      : typeof color === 'string'
        ? color
        : theme.colors.primary;

  const IconComponent = resolveIcon(name, android, ios);
  return <IconComponent color={resolved as string} size={size} strokeWidth={2} />;
}

// Drop-in compatibility exports for existing callers
export function MaterialSymbol(props: any) {
  return <AppIcon android={props.name} color={props.color} size={props.size} />;
}

export function SFSymbol(props: any) {
  return <AppIcon ios={props.name} color={props.color} size={props.size} />;
}

export { AppIcon as Icon };
export default AppIcon;
