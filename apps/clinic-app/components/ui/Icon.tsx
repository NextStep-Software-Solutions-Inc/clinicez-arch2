// token-guard:ignore-file (contains the legacy emoji -> icon lookup table)
import React from 'react';
import {
  Accessibility,
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Baby,
  Banknote,
  BarChart3,
  Bell,
  Briefcase,
  BriefcaseMedical,
  Bug,
  Building2,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Download,
  Droplet,
  Eye,
  FileText,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  HeartPulse,
  Hourglass,
  Info,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Lock,
  LogOut,
  Mail,
  Menu,
  Microscope,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Pill,
  Plus,
  Printer,
  Radio,
  Receipt,
  RefreshCw,
  Save,
  ScanLine,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Siren,
  Smartphone,
  Star,
  Stethoscope,
  Syringe,
  Tag,
  Ticket,
  Timer,
  Trash2,
  Upload,
  User,
  UserCheck,
  Users,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { theme } from '../../constants/theme';

/**
 * Semantic icon registry. Screens refer to icons by meaning (`patients`, `billing`)
 * so the underlying glyph can change in one place. Backed by Lucide - the same set
 * the Portal and Patient app use.
 */
export const ICONS = {
  // Navigation / modules
  dashboard: LayoutDashboard,
  patients: Users,
  patient: User,
  patientVerified: UserCheck,
  staff: Users,
  appointments: CalendarDays,
  calendar: Calendar,
  consultations: Stethoscope,
  billing: CreditCard,
  yakap: ShieldCheck,
  shield: Shield,
  settings: Settings,
  chart: BarChart3,
  clinic: Building2,
  landmark: Landmark,

  // Actions
  search: Search,
  plus: Plus,
  close: X,
  check: Check,
  checkCircle: CheckCircle2,
  edit: Pencil,
  save: Save,
  copy: Copy,
  trash: Trash2,
  print: Printer,
  download: Download,
  upload: Upload,
  refresh: RefreshCw,
  menu: Menu,
  more: MoreHorizontal,
  logout: LogOut,
  lock: Lock,
  key: KeyRound,
  eye: Eye,

  // Direction
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowUpRight: ArrowUpRight,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,

  // Status / feedback
  alert: AlertTriangle,
  alertCircle: AlertCircle,
  info: Info,
  emergency: Siren,
  bell: Bell,
  clock: Clock,
  timer: Timer,
  hourglass: Hourglass,
  zap: Zap,
  star: Star,
  dot: Circle,
  lightbulb: Lightbulb,

  // Clinical
  heartPulse: HeartPulse,
  activity: Activity,
  droplet: Droplet,
  pill: Pill,
  syringe: Syringe,
  lab: FlaskConical,
  microscope: Microscope,
  bug: Bug,
  scan: ScanLine,
  medical: BriefcaseMedical,
  accessibility: Accessibility,
  baby: Baby,

  // Documents / misc
  file: FileText,
  scroll: ScrollText,
  clipboard: ClipboardList,
  receipt: Receipt,
  cash: Banknote,
  tag: Tag,
  ticket: Ticket,
  paperclip: Paperclip,
  folder: Folder,
  camera: Camera,
  phone: Phone,
  mail: Mail,
  globe: Globe,
  wifi: Wifi,
  radio: Radio,
  smartphone: Smartphone,
  graduation: GraduationCap,
  briefcase: Briefcase,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/**
 * Legacy glyph -> icon mapping. Lets primitives (`Button icon=`, `Badge icon=`, ...)
 * accept either an IconName or an old emoji while screens are migrated.
 */
const LEGACY_GLYPHS: Record<string, IconName> = {
  '📊': 'chart', '👥': 'patients', '🩺': 'consultations', '📅': 'appointments', '💳': 'billing',
  '🛡️': 'yakap', '🛡': 'yakap', '⚙️': 'settings', '⚙': 'settings', '✕': 'close', '⚠️': 'alert', '⚠': 'alert',
  '✓': 'check', '🖨️': 'print', '🖨': 'print', '→': 'arrowRight', '🚨': 'emergency', '⏳': 'hourglass',
  '📞': 'phone', '📄': 'file', '🟢': 'dot', '🟡': 'dot', '⭐': 'star', '⚡': 'zap', '👁️': 'eye', '👁': 'eye',
  '🏥': 'clinic', '💡': 'lightbulb', '📜': 'scroll', '📡': 'radio', '💵': 'cash', '📑': 'file',
  '⏱️': 'timer', '⏱': 'timer', '🎟️': 'ticket', '🎟': 'ticket', '📋': 'clipboard', '🔬': 'microscope',
  '🦠': 'bug', '🧪': 'lab', '💉': 'syringe', '👨': 'patient', '⚕️': 'medical', '⚕': 'medical',
  '💰': 'cash', '🏷️': 'tag', '🏷': 'tag', '📶': 'wifi', '↻': 'refresh', '🔍': 'search', '🎓': 'graduation',
  '💼': 'briefcase', '👵': 'patient', '🩸': 'droplet', '♿': 'accessibility', '👤': 'patient', '💊': 'pill',
  '✅': 'checkCircle', '📎': 'paperclip', '📁': 'folder', '🔐': 'lock', '📝': 'edit', '📥': 'download',
  '📷': 'camera', '🩻': 'scan', '🔑': 'key', '🌐': 'globe', '🏛️': 'landmark', '🏛': 'landmark',
  '🏢': 'clinic', '✉️': 'mail', '✉': 'mail', '←': 'arrowLeft', '↗': 'arrowUpRight', '👶': 'baby',
  '💾': 'save', '📱': 'smartphone', '↑': 'arrowUp', '↓': 'arrowDown',
};

/** Resolves an IconName or legacy glyph to an IconName, or null if neither. */
export function resolveIconName(value?: string | null): IconName | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed in ICONS) return trimmed as IconName;
  return LEGACY_GLYPHS[trimmed] ?? null;
}

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function Icon({
  name,
  size = theme.sizes.iconMd,
  color = theme.colors.text,
  strokeWidth = 2,
}: IconProps) {
  const Glyph = ICONS[name] ?? Circle;
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}

/**
 * Renders `value` as an icon when it names one (or is a known legacy glyph), otherwise
 * as nothing. Used by primitives that take an `icon` prop.
 */
export function IconSlot({
  value,
  size = theme.sizes.iconSm,
  color,
}: {
  value?: string | null;
  size?: number;
  color?: string;
}) {
  const name = resolveIconName(value);
  if (!name) return null;
  return <Icon name={name} size={size} color={color} />;
}
