import {
  Wrench, Folder, FileText, DollarSign, Users, Search, Download, Plus,
  AlertTriangle, ArrowUpRight, MoreHorizontal, Package, Tag, X, Star,
  Pencil, Save, ArrowLeft, ChevronDown, ChevronRight, Check, RotateCw,
  FileUp, LogOut, Eye, EyeOff, History, Menu, Trash2, Share2, ListChecks,
  ShoppingCart, Copy, BadgeCheck, Layers, ArrowDown, ArrowUp, Ruler,
} from 'lucide-react'

const MAP = {
  wrench: Wrench, folder: Folder, 'file-text': FileText, 'dollar-sign': DollarSign,
  users: Users, search: Search, download: Download, plus: Plus,
  'alert-triangle': AlertTriangle, 'arrow-up-right': ArrowUpRight,
  'more-horizontal': MoreHorizontal, package: Package, tag: Tag, x: X, star: Star,
  pencil: Pencil, save: Save, 'arrow-left': ArrowLeft, 'chevron-down': ChevronDown,
  'chevron-right': ChevronRight, check: Check, 'rotate-cw': RotateCw,
  'file-up': FileUp, 'log-out': LogOut, eye: Eye, 'eye-off': EyeOff, history: History, menu: Menu,
  trash: Trash2, share: Share2, 'list-checks': ListChecks,
  cart: ShoppingCart, copy: Copy, 'badge-check': BadgeCheck, layers: Layers,
  'arrow-down': ArrowDown, 'arrow-up': ArrowUp, ruler: Ruler,
}

export function Icon({ n, s = 18, style, ...rest }) {
  const Cmp = MAP[n] || Package
  return <Cmp size={s} strokeWidth={2} style={{ display: 'block', ...style }} {...rest} />
}
