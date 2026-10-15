// Maps stored icon names to Lucide components. Named imports keep the bundle to this set.
import {
  Activity, Award, Banknote, BatteryCharging, Bell, BookOpen, Boxes, Briefcase, Building, Calculator, Calendar,
  ChartColumn, ChartLine, CircleCheck, Clock, Cloud, CreditCard, Database, DoorOpen, Droplets, Eye, Factory,
  FileText, Fish, Flag, Gauge, GitPullRequest, Globe, GraduationCap, HandCoins, Heart, KeyRound, Landmark,
  Layers, Leaf, Lightbulb, Link2, ListChecks, Lock, MapPin, MessageSquare, Package, Percent, PiggyBank, QrCode,
  Receipt, RefreshCw, Rocket, Scale, Search, Server, ShieldCheck, ShoppingBag, Smartphone, Snowflake,
  Stethoscope, Store, Sun, Table2, Target, Thermometer, Timer, TrendingUp, TriangleAlert, Truck, Users,
  Utensils, Wallet, WifiOff, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/deck/icons";

const MAP: Record<IconName, LucideIcon> = {
  receipt: Receipt, smartphone: Smartphone, "circle-check": CircleCheck, clock: Clock, "triangle-alert": TriangleAlert,
  zap: Zap, factory: Factory, gauge: Gauge, fish: Fish, thermometer: Thermometer, "qr-code": QrCode, snowflake: Snowflake,
  calendar: Calendar, bell: Bell, users: Users, stethoscope: Stethoscope, truck: Truck, "battery-charging": BatteryCharging,
  "map-pin": MapPin, "file-text": FileText, scale: Scale, search: Search, cloud: Cloud, "wifi-off": WifiOff,
  "refresh-cw": RefreshCw, utensils: Utensils, "credit-card": CreditCard, "git-pull-request": GitPullRequest,
  server: Server, database: Database, "chart-line": ChartLine, "chart-column": ChartColumn, "shield-check": ShieldCheck,
  "key-round": KeyRound, "door-open": DoorOpen, sun: Sun, package: Package, "shopping-bag": ShoppingBag,
  "book-open": BookOpen, leaf: Leaf, droplets: Droplets, lightbulb: Lightbulb, target: Target, "list-checks": ListChecks,
  rocket: Rocket, "trending-up": TrendingUp, wallet: Wallet, building: Building, heart: Heart, globe: Globe, lock: Lock,
  layers: Layers, timer: Timer, banknote: Banknote, "hand-coins": HandCoins, store: Store, boxes: Boxes,
  briefcase: Briefcase, "graduation-cap": GraduationCap, calculator: Calculator, "link-2": Link2, "table-2": Table2,
  eye: Eye, "message-square": MessageSquare, award: Award, flag: Flag, wrench: Wrench, landmark: Landmark,
  "piggy-bank": PiggyBank, percent: Percent, activity: Activity,
};

export function Icon({ name, size = 40, stroke = 1.75, color = "currentColor" }: { name?: string; size?: number; stroke?: number; color?: string }) {
  const C = (name && MAP[name as IconName]) || CircleCheck;
  return <C width={size} height={size} strokeWidth={stroke} color={color} aria-hidden="true" />;
}
