import { useState, useEffect } from 'react';
import {
  Monitor,
  EyeOff,
  Footprints,
  BellRing,
  LogIn,
  ArrowLeft,
  TimerReset,
  Volume2,
  Globe,
  Share2,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  FileJson,
  Flame,
  Keyboard,
} from 'lucide-react';
import type { StatsResponse } from './lib/tauri-bridge';
import { Switch } from './components/ui/switch';
import { useSetting } from './hooks/useSetting';

// X (Twitter) icon - custom SVG since lucide doesn't have the new X logo
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Separator } from './components/ui/separator';
import { Button } from './components/ui/button';
import { Label } from './components/ui/label';
import { StartupSettings } from './startupSettings';
import { FocusSettings } from './focusSettings';
import { IdleTimeSettings } from './idleTimeSettings';
import { ShortBreakSettings } from './shortBreakSettings';
import { PreBreakSettings } from './preBreakSettings';
import { LongBreakSettings } from './longBreakSettings';
import { ChimeSettings } from './chimeSettings';
import { track } from './lib/analytics';
import { AUTHORS, APP_INFO } from './constants/authors';

function ConfigPathSettings() {
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electron.app.getConfigPath().then(setConfigPath);
  }, []);

  const copyConfigPath = () => {
    if (configPath) {
      navigator.clipboard.writeText(configPath);
      setCopied(true);
      track('config_path_copied');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between space-x-2 w-full">
      <Label className="flex flex-col space-y-1">
        <span>Config location</span>
        <span className="font-normal leading-snug text-muted-foreground text-xs font-mono truncate max-w-[300px]">
          {configPath || 'Loading...'}
        </span>
      </Label>
      <button
        type="button"
        onClick={copyConfigPath}
        disabled={!configPath}
        className="p-2 hover:bg-muted rounded-md transition-colors disabled:opacity-50"
        title="Copy path"
      >
        {copied ? (
          <Check className="w-4 h-4" style={{ color: '#eab308' }} />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function ResetSettings() {
  const handleReset = async () => {
    await window.electron.app.resetSettings();
    track('settings_reset');
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-between space-x-2 w-full">
      <Label className="flex flex-col space-y-1">
        <span>Reset settings</span>
        <span className="font-normal leading-snug text-muted-foreground text-xs">
          Double-click to reset
        </span>
      </Label>
      <button
        type="button"
        onDoubleClick={handleReset}
        className="p-2 hover:bg-muted rounded-md transition-all group"
        title="Double-click to reset"
      >
        <RotateCcw className="w-4 h-4 text-muted-foreground group-hover:text-yellow-500 group-active:text-red-500 group-active:rotate-180 transition-all duration-300" />
      </button>
    </div>
  );
}

// Keyboard shortcut definitions with setting keys
const SHORTCUTS = [
  { keys: '⌘ ⇧ N', action: 'Start / End session', setting: 'shortcut_start_enabled' },
  { keys: '⌘ ⇧ P', action: 'Pause / Resume', setting: 'shortcut_pause_enabled' },
  { keys: '⌘ ⇧ B', action: 'Take / End break', setting: 'shortcut_break_enabled' },
  { keys: '⌘ ⇧ S', action: 'Skip break', setting: 'shortcut_skip_enabled' },
];

function KeyboardShortcutsSettings() {
  const [shortcutsEnabled, setShortcutsEnabled] = useSetting<boolean>('shortcuts_enabled', true);
  
  return (
    <div className="w-full">
      <div className="flex items-center justify-between space-x-2 mb-3">
        <Label className="flex flex-col space-y-1">
          <span>Keyboard shortcuts</span>
          <span className="font-normal text-muted-foreground text-xs">
            Global hotkeys work even when AFK is in background
          </span>
        </Label>
        <Switch
          checked={shortcutsEnabled}
          onCheckedChange={setShortcutsEnabled}
        />
      </div>
      {shortcutsEnabled && (
        <div className="space-y-3 pl-1">
          {SHORTCUTS.map((shortcut) => {
            const [enabled, setEnabled] = useSetting<boolean>(shortcut.setting, true);
            return (
              <div key={shortcut.keys} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    className="scale-90"
                  />
                  <span className="text-sm text-neutral-400">{shortcut.action}</span>
                </div>
                <kbd className="px-2 py-1 text-xs font-mono bg-neutral-800 text-neutral-300 rounded border border-neutral-700 ml-2">
                  {shortcut.keys}
                </kbd>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Format time for display
function formatTime(seconds: number): string {
  if (seconds < 60) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function getWeekdayLetter(dateStr: string): string {
  const date = new Date(dateStr);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()];
}

function StatsContent() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const data = await window.electron.stats.getStats();
    if (data) setStats(data);
    setLoading(false);
  };

  const handleClearStats = async () => {
    await window.electron.stats.clearStats();
    track('stats_cleared');
    loadStats();
  };

  if (loading) {
    return <div className="text-center text-neutral-500 py-12">Loading...</div>;
  }

  if (!stats || stats.all_time.total_focus_secs === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">👀</div>
        <p className="text-neutral-400">No stats yet</p>
        <p className="text-neutral-600 text-sm mt-1">Start focusing to see your progress</p>
      </div>
    );
  }

  const breaksTaken = stats.today.breaks_taken + stats.today.breaks_skipped;
  const weekAvg = stats.week.avg_daily_focus_secs;
  const todayVsAvg = weekAvg > 0 
    ? Math.round(((stats.today.total_focus_secs - weekAvg) / weekAvg) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Hero: Today's Focus */}
      <div className="text-center pt-2 pb-4">
        <div className="text-5xl font-bold text-white tracking-tight">
          {formatTime(stats.today.total_focus_secs)}
        </div>
        <div className="text-neutral-500 text-sm mt-2">
          focused today
          {todayVsAvg !== 0 && Math.abs(todayVsAvg) >= 10 && (
            <span className={todayVsAvg > 0 ? 'text-emerald-500' : 'text-amber-500'}>
              {' · '}{todayVsAvg > 0 ? '+' : ''}{todayVsAvg}% vs avg
            </span>
          )}
        </div>
      </div>

      {/* Two stat cards side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-neutral-800/40 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{breaksTaken}</div>
          <div className="text-neutral-500 text-xs mt-1">breaks today</div>
        </div>
        <div className="bg-neutral-800/40 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span className="text-2xl font-bold text-white">{stats.streak.current}</span>
          </div>
          <div className="text-neutral-500 text-xs mt-1">
            day streak{stats.streak.longest > stats.streak.current && ` · best ${stats.streak.longest}`}
          </div>
        </div>
      </div>

      {/* Week visualization */}
      <div className="bg-neutral-800/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-neutral-400 text-sm">This week</span>
          <span className="text-white text-sm font-medium">{formatTime(stats.week.total_focus_secs)}</span>
        </div>
        <div className="flex items-end justify-between gap-1 h-12">
          {stats.weekly_trend.map((day, i) => {
            const maxVal = Math.max(...stats.weekly_trend.map(d => d.total_focus_secs), 1);
            const height = (day.total_focus_secs / maxVal) * 100;
            const isToday = i === stats.weekly_trend.length - 1;
            return (
              <div key={day.date} className="flex flex-col items-center flex-1 gap-1">
                <div
                  className={`w-full rounded-sm transition-all ${
                    isToday 
                      ? 'bg-amber-500' 
                      : day.total_focus_secs > 0 
                        ? 'bg-neutral-600' 
                        : 'bg-neutral-700/50'
                  }`}
                  style={{ height: `${Math.max(height, 8)}%`, minHeight: '3px' }}
                />
                <span className={`text-[10px] ${isToday ? 'text-amber-400' : 'text-neutral-600'}`}>
                  {getWeekdayLetter(day.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* All-time summary - subtle */}
      <div className="flex items-center justify-center gap-6 text-sm text-neutral-500 pt-2">
        <span>All time: <span className="text-neutral-400">{formatTime(stats.all_time.total_focus_secs)}</span></span>
        <span>·</span>
        <span><span className="text-neutral-400">{stats.all_time.total_breaks}</span> breaks</span>
      </div>

      {/* Clear - tucked away */}
      <button
        type="button"
        onDoubleClick={handleClearStats}
        className="w-full text-center text-neutral-700 text-xs py-2 hover:text-red-500 transition-colors"
        title="Double-click to clear all stats"
      >
        Double-click to reset
      </button>
    </div>
  );
}

function Settings({
  setShowSettings,
}: {
  setShowSettings: (arg0: boolean) => void;
}) {
  return (
    <div className="grid min-h-screen w-full">
      <div className="flex flex-col px-40">
        <main className="flex flex-1 flex-col p-4 lg:p-6">
          <Tabs defaultValue="general">
            <ArrowLeft
              width={20}
              height={20}
              className="cursor-pointer fixed mt-2"
              onClick={() => setShowSettings(false)}
            />
            <TabsList className="justify-center">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
            <TabsContent value="general">
              <div className="pt-4" />
              <div className="flex items-start gap-x-8 [&>div]:w-full">
                <Monitor className="self-center" width={20} height={20} />
                <FocusSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-center gap-x-8 [&>div]:w-full">
                <EyeOff className="self-center" width={20} height={20} />
                <ShortBreakSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-center justify-center gap-x-8 [&>div]:w-full">
                <Footprints className="self-center" width={20} height={20} />
                <LongBreakSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-center justify-center gap-x-8 [&>div]:w-full">
                <BellRing className="self-center" width={20} height={20} />
                <PreBreakSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-center justify-center gap-x-8 [&>div]:w-full">
                <TimerReset className="self-center" width={20} height={20} />
                <IdleTimeSettings />
              </div>
            </TabsContent>
            <TabsContent value="system">
              <div className="pt-4" />
              <div className="flex items-center justify-center gap-x-8 [&>div]:w-full">
                <LogIn width={20} height={20} />
                <StartupSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-start gap-x-8 [&>div]:w-full">
                <Volume2 width={20} height={20} className="mt-1" />
                <ChimeSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-center gap-x-8 [&>div]:w-full">
                <FileJson width={20} height={20} />
                <ConfigPathSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
              <div className="pt-4" />
              <div className="flex items-center gap-x-8 [&>div]:w-full">
                <RotateCcw width={20} height={20} />
                <ResetSettings />
              </div>
              <div className="pt-4" />
              <Separator className="my-4" />
<div className="pt-4" />
               <div className="flex items-start gap-x-8 [&>div]:w-full">
                 <Keyboard width={20} height={20} className="mt-1" />
                 <KeyboardShortcutsSettings />
               </div>
            </TabsContent>
            <TabsContent value="stats">
              <div className="pt-4 max-w-md mx-auto">
                <StatsContent />
              </div>
            </TabsContent>
            <TabsContent value="about">
              <div className="pt-8 text-center">
                {/* App Logo & Name */}
                <h1 className="text-3xl font-bold text-white mb-2">{APP_INFO.name}</h1>
                <p className="text-neutral-400 mb-1">Version {APP_INFO.version}</p>
                <p className="text-neutral-500 text-sm mb-8">{APP_INFO.tagline}</p>
                
                {/* Tagline */}
                <div className="bg-neutral-800/50 rounded-lg p-6 mb-8 max-w-md mx-auto">
                  <p className="text-neutral-300 italic">
                    &ldquo;Your eyes deserve a break. So do you.&rdquo;
                  </p>
                </div>

                {/* Share Section */}
                <div className="mb-8">
                  <p className="text-neutral-400 text-sm mb-4">Love AFK? Share it with friends!</p>
                  <div className="flex justify-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        track('share_twitter');
                        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent('👀 Taking better care of my eyes with AFK - a beautiful break reminder app for developers. Check it out!')}&url=${encodeURIComponent(APP_INFO.website)}`;
                        window.electron.app.openUrl(tweetUrl);
                      }}
                    >
                      <XIcon className="w-4 h-4 mr-2" />
                      Tweet
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        track('share_copy_link');
                        navigator.clipboard.writeText(APP_INFO.website);
                      }}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Copy Link
                    </Button>
                  </div>
                </div>

                <Separator className="my-6 max-w-md mx-auto" />

                {/* Links */}
                <div className="flex justify-center gap-6 mb-8">
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-white transition-colors flex items-center gap-2"
                    onClick={() => { track('link_website'); window.electron.app.openUrl(APP_INFO.website); }}
                  >
                    <Globe className="w-4 h-4" />
                    Website
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-white transition-colors flex items-center gap-2"
                    onClick={() => { track('link_twitter_chaitanya'); window.electron.app.openUrl(AUTHORS.chaitanya.twitter); }}
                  >
                    <XIcon className="w-4 h-4" />
                    {AUTHORS.chaitanya.twitterHandle}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-white transition-colors flex items-center gap-2"
                    onClick={() => { track('link_twitter_harry'); window.electron.app.openUrl(AUTHORS.harry.twitter); }}
                  >
                    <XIcon className="w-4 h-4" />
                    {AUTHORS.harry.twitterHandle}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* Made with love */}
                <div className="text-neutral-500 text-sm flex items-center justify-center gap-1 flex-wrap">
                  Developed by
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-white transition-colors"
                    onClick={() => window.electron.app.openUrl(AUTHORS.chaitanya.github)}
                  >
                    {AUTHORS.chaitanya.displayName}
                  </button>
                  &
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-white transition-colors"
                    onClick={() => window.electron.app.openUrl(AUTHORS.harry.github)}
                  >
                    {AUTHORS.harry.displayName}
                  </button>
                </div>
                <p className="text-neutral-600 text-xs mt-2">
                  {APP_INFO.copyright}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

export default Settings;
