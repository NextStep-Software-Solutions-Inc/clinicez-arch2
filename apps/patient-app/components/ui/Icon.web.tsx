import React from 'react';
import { ColorValue } from 'react-native';
import {
  Bell,
  Settings,
  Camera,
  User,
  CreditCard,
  Phone,
  MapPin,
  AlertTriangle,
  AlertCircle,
  Pill,
  Scissors,
  Activity,
  HeartPulse,
  Accessibility,
  Syringe,
  Sparkles,
  Briefcase,
  Plane,
  Users,
  Eye,
  Brain,
  MessageSquare,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  ClipboardList,
  Monitor,
  CheckSquare,
  Maximize2,
  Share2,
  FolderInput,
  Edit3,
  Trash2,
  ChevronRight,
  Check,
  X,
  ChevronsUpDown,
  Circle,
  Stethoscope,
  Home,
  Heart,
  Files,
  type LucideIcon,
} from 'lucide-react-native';

export interface IconProps {
  android?: string;
  ios?: string;
  name?: string;
  color?: ColorValue;
  size?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
  // Tabs & Navigation
  'home': Home,
  'house.fill': Home,
  'heart_check': Heart,
  'heart.fill': Heart,
  'files': Files,
  'doc.fill': FileText,
  'notifications': Bell,
  'bell.fill': Bell,
  'bell': Bell,
  'settings': Settings,
  'gear': Settings,
  'photo_camera': Camera,
  'camera.fill': Camera,

  // Profile Sections
  'person': User,
  'person.fill': User,
  'badge': CreditCard,
  'creditcard.fill': CreditCard,
  'call': Phone,
  'phone.fill': Phone,
  'location_on': MapPin,
  'location.fill': MapPin,
  'emergency': AlertTriangle,
  'person.crop.circle.badge.exclamationmark.fill': AlertTriangle,
  'local_hospital': Stethoscope,
  'stethoscope': Stethoscope,
  'warning': AlertCircle,
  'exclamationmark.triangle.fill': AlertCircle,
  'medication': Pill,
  'pills.fill': Pill,
  'content_cut': Scissors,
  'scissors': Scissors,
  'sick': Activity,
  'thermometer.medium': Activity,
  'monitor_heart': HeartPulse,
  'heart.text.clipboard.fill': HeartPulse,
  'accessibility': Accessibility,
  'figure.roll': Accessibility,
  'vaccines': Syringe,
  'syringe.fill': Syringe,
  'self_improvement': Sparkles,
  'leaf.fill': Sparkles,
  'work': Briefcase,
  'briefcase.fill': Briefcase,
  'flight': Plane,
  'airplane': Plane,
  'family_restroom': Users,
  'person.2.fill': Users,
  'pregnant_woman': Activity,
  'waveform.path.ecg': Activity,
  'male': User,
  'visibility': Eye,
  'eye.fill': Eye,
  'psychology': Brain,
  'brain.head.profile': Brain,
  'chat_bubble': MessageSquare,
  'receipt_long': FileText,
  'doc.text.fill': FileText,
  'science': FlaskConical,
  'flask.fill': FlaskConical,
  'image': ImageIcon,
  'photo.fill': ImageIcon,
  'assignment': ClipboardList,
  'list.clipboard.fill': ClipboardList,
  'monitor': Monitor,
  'quiz': CheckSquare,
  'checklist': CheckSquare,

  // Actions & Controls
  'fullscreen': Maximize2,
  'arrow.up.left.and.arrow.down.right': Maximize2,
  'share': Share2,
  'square.and.arrow.up': Share2,
  'drive_file_move': FolderInput,
  'folder': FolderInput,
  'edit': Edit3,
  'pencil': Edit3,
  'delete': Trash2,
  'trash': Trash2,
  'chevron': ChevronRight,
  'chevron.right': ChevronRight,
  'check': Check,
  'checkmark': Check,
  'close': X,
  'xmark': X,
  'unfold_more': ChevronsUpDown,
  'chevron.up.chevron.down': ChevronsUpDown,
};

export function AppIcon({ android, ios, name, color = '#3B82F6', size = 20 }: IconProps) {
  const iconKey = (android || ios || name || '').toLowerCase();
  const IconComponent = ICON_MAP[iconKey] || Circle;
  const resolvedColor = typeof color === 'string' ? color : '#3B82F6';

  return <IconComponent color={resolvedColor} size={size} />;
}

// Drop-in compatibility exports for @react-navigation/native symbol calls on web
export function MaterialSymbol(props: any) {
  return <AppIcon android={props.name} color={props.color} size={props.size} />;
}

export function SFSymbol(props: any) {
  return <AppIcon ios={props.name} color={props.color} size={props.size} />;
}

export default AppIcon;
