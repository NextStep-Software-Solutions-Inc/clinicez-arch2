// token-guard:ignore-file (contains the legacy emoji -> icon lookup table)
import React, { useEffect, useRef } from 'react';
import { Animated, Platform } from 'react-native';
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
  AppWindow,
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
  Cloud,
  Copy,
  CreditCard,
  Crop,
  Download,
  Droplet,
  Eye,
  FileText,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  GripVertical,
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
  MapPin,
  Maximize2,
  Menu,
  Microscope,
  Minimize2,
  Minus,
  Monitor,
  MoreHorizontal,
  MoreVertical,
  PanelLeft,
  PanelRight,
  Paperclip,
  Palette,
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
  Undo,
  Upload,
  User,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
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
  undo: Undo,
  palette: Palette,
  maximize: Maximize2,
  minimize: Minimize2,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  minus: Minus,
  crop: Crop,
  menu: Menu,
  more: MoreHorizontal,
  moreVertical: MoreVertical,
  kebab: MoreVertical,
  gripVertical: GripVertical,
  dragHandle: GripVertical,
  logout: LogOut,
  lock: Lock,
  key: KeyRound,
  eye: Eye,
  layoutModal: AppWindow,
  layoutSplit: PanelLeft,
  layoutDrawer: PanelRight,

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
  stethoscope: Stethoscope,
  mapPin: MapPin,
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
  monitor: Monitor,
  cloud: Cloud,
  volume2: Volume2,
  volumeX: VolumeX,
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
  spin?: boolean;
}

export default function Icon({
  name,
  size = theme.sizes.iconMd,
  color = theme.colors.text,
  strokeWidth = 2,
  spin = false,
}: IconProps) {
  const Glyph = ICONS[name] ?? Circle;

  if (spin) {
    return (
      <SpinningIconGlyph
        Glyph={Glyph}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
      />
    );
  }

  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}

function SpinningIconGlyph({
  Glyph,
  size,
  color,
  strokeWidth,
}: {
  Glyph: any;
  size: number;
  color: string;
  strokeWidth: number;
}) {
  const isWeb = Platform.OS === 'web';
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isWeb) return;
    let loop: Animated.CompositeAnimation | null = null;
    if (spinAnim && typeof spinAnim.setValue === 'function') {
      spinAnim.setValue(0);
    }
    if (Animated && typeof Animated.loop === 'function' && typeof Animated.timing === 'function') {
      loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 850,
          easing: (t) => t,
          useNativeDriver: true,
        })
      );
      loop.start();
    }
    return () => {
      if (loop && typeof loop.stop === 'function') loop.stop();
    };
  }, [spinAnim, isWeb]);

  const rotation =
    !isWeb && spinAnim && typeof spinAnim.interpolate === 'function'
      ? spinAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        })
      : '0deg';

  useEffect(() => {
    if (isWeb && typeof document !== 'undefined') {
      if (!document.getElementById('clinicez-spin-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'clinicez-spin-style';
        styleEl.textContent = `
          @keyframes clinicez-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .clinicez-spin-glyph {
            animation: clinicez-spin 0.85s linear infinite !important;
            transform-origin: center center !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
        `;
        document.head.appendChild(styleEl);
      }
    }
  }, [isWeb]);

  return (
    <Animated.View
      accessibilityRole="image"
      // @ts-ignore React Native Web supports className
      className={isWeb ? 'clinicez-spin-glyph' : undefined}
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: isWeb ? undefined : [{ rotate: rotation }],
        },
        isWeb && ({
          animationKeyframes: {
            '0%': { transform: [{ rotate: '0deg' }] },
            '100%': { transform: [{ rotate: '360deg' }] },
          },
          animationDuration: '0.85s',
          animationIterationCount: 'infinite',
          animationTimingFunction: 'linear',
          transformOrigin: 'center center',
        } as any),
      ]}
    >
      <Glyph size={size} color={color} strokeWidth={strokeWidth} />
    </Animated.View>
  );
}

/**
 * Renders `value` as an icon when it names one (or is a known legacy glyph), otherwise
 * as nothing. Used by primitives that take an `icon` prop.
 */
export function IconSlot({
  value,
  size = theme.sizes.iconSm,
  color,
  spin = false,
}: {
  value?: string | null;
  size?: number;
  color?: string;
  spin?: boolean;
}) {
  const name = resolveIconName(value);
  if (!name) return null;
  return <Icon name={name} size={size} color={color} spin={spin} />;
}
