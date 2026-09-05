import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Upload, Wand2, Download, RefreshCw, Type, Palette, Sliders, Check, Sparkles } from 'lucide-react';
import { ArtworkSettings, AudiobookMetadata } from '../types';

interface ArtworkDesignerProps {
  settings: ArtworkSettings;
  onUpdateSettings: (newSettings: Partial<ArtworkSettings>) => void;
  onCoverRendered: (blob: Blob, url: string) => void;
  metadata: AudiobookMetadata;
}

const PRESET_THEMES = [
  { id: 'amber', name: 'Golden Amber', color: '#f59e0b', gradient: ['#78350f', '#1c1917'] },
  { id: 'indigo', name: 'Midnight Navy', color: '#6366f1', gradient: ['#1e1b4b', '#09090b'] },
  { id: 'emerald', name: 'Forest Emerald', color: '#10b981', gradient: ['#064e3b', '#09090b'] },
  { id: 'ruby', name: 'Crimson Velvet', color: '#f43f5e', gradient: ['#881337', '#09090b'] },
  { id: 'obsidian', name: 'Classic Obsidian', color: '#a8a29e', gradient: ['#292524', '#0c0a09'] },
];

export const ArtworkDesigner: React.FC<ArtworkDesignerProps> = ({
  settings,
  onUpdateSettings,
  onCoverRendered,
  metadata,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'text' | 'adjust' | 'presets'>('upload');
  const [isGeneratingArtwork, setIsGeneratingArtwork] = useState(false);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);

  const onCoverRenderedRef = useRef(onCoverRendered);
  useEffect(() => {
    onCoverRenderedRef.current = onCoverRendered;
  }, [onCoverRendered]);

  const prevUrlRef = useRef<string | null>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
    };
  }, []);

  // Render canvas whenever settings or metadata change
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 800;
    const height = 800;
    canvas.width = width;
    canvas.height = height;

    const drawContent = (bgImage?: HTMLImageElement) => {
      ctx.clearRect(0, 0, width, height);

      if (bgImage) {
        // Draw user uploaded photo with filters
        ctx.save();
        ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;
        
        // Center crop image into 1:1 square
        const imgRatio = bgImage.width / bgImage.height;
        let sWidth = bgImage.width;
        let sHeight = bgImage.height;
        let sx = 0;
        let sy = 0;

        if (imgRatio > 1) {
          sWidth = bgImage.height;
          sx = (bgImage.width - sWidth) / 2;
        } else {
          sHeight = bgImage.width;
          sy = (bgImage.height - sHeight) / 2;
        }

        ctx.drawImage(bgImage, sx, sy, sWidth, sHeight, 0, 0, width, height);
        ctx.restore();
      } else {
        // Draw themed gradient background
        const theme = PRESET_THEMES.find(t => t.color === settings.themeColor) || PRESET_THEMES[0];
        const gradient = ctx.createRadialGradient(
          width / 2, height / 3, 50,
          width / 2, height / 2, width * 0.7
        );
        gradient.addColorStop(0, theme.gradient[0]);
        gradient.addColorStop(1, theme.gradient[1]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Elegant geometric decorative borders
        ctx.strokeStyle = `${settings.themeColor}33`;
        ctx.lineWidth = 2;
        ctx.strokeRect(30, 30, width - 60, height - 60);
        ctx.strokeRect(40, 40, width - 80, height - 80);

        // Subtle center motif
        ctx.beginPath();
        ctx.arc(width / 2, height / 2.3, 120, 0, Math.PI * 2);
        ctx.strokeStyle = `${settings.themeColor}22`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Gradient shadow overlay for readable typography
      if (settings.gradientOverlay || settings.titleOverlay) {
        const overlayGrad = ctx.createLinearGradient(0, height * 0.35, 0, height);
        overlayGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        overlayGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
        overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, width, height);

        // Top gradient for badge
        const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.25);
        topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, width, height * 0.25);
      }

      // Draw Top Badge if enabled
      if (settings.showBadge && settings.badgeText) {
        ctx.save();
        const badgeY = 55;
        ctx.font = '600 13px system-ui, sans-serif';
        const badgeText = settings.badgeText.toUpperCase();
        const badgeMetrics = ctx.measureText(badgeText);
        const badgeWidth = badgeMetrics.width + 36;
        const badgeHeight = 28;
        const badgeX = (width - badgeWidth) / 2;

        // Pill background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.strokeStyle = settings.themeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY - 18, badgeWidth, badgeHeight, 14);
        ctx.fill();
        ctx.stroke();

        // Badge text
        ctx.fillStyle = settings.themeColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, width / 2, badgeY - 4);
        ctx.restore();
      }

      // Draw Title & Author Typography Overlay
      if (settings.titleOverlay) {
        ctx.save();
        ctx.textAlign = 'center';

        const title = metadata.title || 'Untitled Audiobook';
        const author = metadata.author ? `BY ${metadata.author.toUpperCase()}` : '';
        const narrator = metadata.narrator ? `NARRATED BY ${metadata.narrator.toUpperCase()}` : '';

        // Font family setting
        const fontFam =
          settings.fontFamily === 'serif'
            ? 'Georgia, serif'
            : settings.fontFamily === 'display'
            ? 'Impact, sans-serif'
            : settings.fontFamily === 'mono'
            ? 'Courier New, monospace'
            : 'system-ui, -apple-system, sans-serif';

        // Title text wrapping
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 38px ${fontFam}`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;

        // Wrap title if long
        const words = title.split(' ');
        const lines: string[] = [];
        let curLine = '';

        for (const word of words) {
          const testLine = curLine ? `${curLine} ${word}` : word;
          const metrics = ctx.measureText(testLine);
          if (metrics.width > width - 120 && curLine) {
            lines.push(curLine);
            curLine = word;
          } else {
            curLine = testLine;
          }
        }
        if (curLine) lines.push(curLine);

        // Draw title lines
        const lineHeight = 46;
        const totalTitleHeight = lines.length * lineHeight;
        const startY = height - 160 - totalTitleHeight;

        lines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, startY + idx * lineHeight);
        });

        // Decorative separator line
        ctx.strokeStyle = settings.themeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 50, startY + totalTitleHeight + 10);
        ctx.lineTo(width / 2 + 50, startY + totalTitleHeight + 10);
        ctx.stroke();

        // Draw Author
        if (settings.authorOverlay && author) {
          ctx.font = `600 16px ${fontFam}`;
          ctx.fillStyle = '#f5f5f4';
          ctx.letterSpacing = '2px';
          ctx.fillText(author, width / 2, startY + totalTitleHeight + 40);
        }

        // Draw Narrator
        if (narrator) {
          ctx.font = `500 13px system-ui, sans-serif`;
          ctx.fillStyle = '#d6d3d1';
          ctx.fillText(narrator, width / 2, startY + totalTitleHeight + 68);
        }

        ctx.restore();
      }

      // Convert canvas to blob and notify parent
      canvas.toBlob((blob) => {
        if (blob) {
          if (prevUrlRef.current) {
            URL.revokeObjectURL(prevUrlRef.current);
          }
          const url = URL.createObjectURL(blob);
          prevUrlRef.current = url;
          setRenderedImageUrl(url);
          onCoverRenderedRef.current?.(blob, url);
        }
      }, 'image/jpeg', 0.95);
    };

    if (settings.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => drawContent(img);
      img.onerror = () => drawContent();
      img.src = settings.imageUrl;
    } else {
      drawContent();
    }
  }, [
    settings.imageUrl,
    settings.themeColor,
    settings.brightness,
    settings.contrast,
    settings.titleOverlay,
    settings.authorOverlay,
    settings.badgeText,
    settings.showBadge,
    settings.gradientOverlay,
    settings.fontFamily,
    metadata.title,
    metadata.author,
    metadata.narrator,
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      onUpdateSettings({
        imageUrl: url,
        imageBlob: file,
        titleOverlay: true,
        authorOverlay: true,
        showBadge: true,
      });
      e.target.value = '';
    }
  };

  // Procedural Artwork Generator (Synthesizes artistic cover backgrounds)
  const generateProceduralArtwork = () => {
    setIsGeneratingArtwork(true);
    setTimeout(() => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 1200;
      tempCanvas.height = 1200;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        // Dramatic cosmic/literary gradient
        const theme = PRESET_THEMES[Math.floor(Math.random() * PRESET_THEMES.length)];
        const grad = ctx.createLinearGradient(0, 0, 1200, 1200);
        grad.addColorStop(0, theme.gradient[0]);
        grad.addColorStop(0.5, '#09090b');
        grad.addColorStop(1, theme.gradient[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1200, 1200);

        // Generate glowing atmospheric rings
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          const radius = 200 + i * 80;
          ctx.arc(600, 500, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `${theme.color}${Math.floor(10 + i * 5).toString(16)}`;
          ctx.lineWidth = 2 + i;
          ctx.stroke();
        }

        // Starfield / light particle dust
        for (let i = 0; i < 120; i++) {
          const x = Math.random() * 1200;
          const y = Math.random() * 1200;
          const r = Math.random() * 2 + 0.5;
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.8})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        tempCanvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            onUpdateSettings({
              imageUrl: url,
              imageBlob: blob,
              themeColor: theme.color,
            });
          }
          setIsGeneratingArtwork(false);
        }, 'image/jpeg', 0.95);
      }
    }, 400);
  };

  const handleDownloadArtwork = () => {
    if (!renderedImageUrl) return;
    const a = document.createElement('a');
    a.href = renderedImageUrl;
    a.download = `cover_${metadata.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'audiobook'}.jpg`;
    a.click();
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-200">Audiobook Artwork & Cover Design</h3>
            <p className="text-xs text-stone-400">Embeds directly into ID3 APIC frames & package</p>
          </div>
        </div>

        {renderedImageUrl && (
          <button
            id="download-artwork-btn"
            type="button"
            onClick={handleDownloadArtwork}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-300 hover:text-stone-100 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
            title="Download high-resolution cover image (JPG)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Save JPG
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Interactive Canvas / Live Preview */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="relative group w-full max-w-[280px] aspect-square rounded-xl overflow-hidden border-2 border-stone-700 bg-stone-950 shadow-xl shadow-stone-950/60">
            <canvas ref={canvasRef} className="w-full h-full object-cover" />

            {/* Quick Hover Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4 text-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-medium text-stone-100 bg-amber-600 hover:bg-amber-500 rounded-lg shadow transition-colors"
              >
                Change Photo
              </button>
              <button
                type="button"
                onClick={generateProceduralArtwork}
                className="px-3 py-1.5 text-xs font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              >
                Generate Theme Art
              </button>
            </div>
          </div>
          <span className="text-[11px] text-stone-400 mt-2 font-mono">
            1:1 Square (1400×1400 Master Ratio)
          </span>
        </div>

        {/* Right: Cover Customizer & Controls */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 p-1 bg-stone-950 rounded-xl border border-stone-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'upload' ? 'bg-stone-800 text-amber-400 shadow' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Photo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'text' ? 'bg-stone-800 text-amber-400 shadow' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              Typography
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'presets' ? 'bg-stone-800 text-amber-400 shadow' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              Themes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('adjust')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'adjust' ? 'bg-stone-800 text-amber-400 shadow' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Adjust
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoUpload}
            className="hidden"
            id="cover-photo-upload-input"
          />

          {/* TAB 1: Photo Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  id="upload-cover-photo-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2.5 px-3 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-amber-500/50 rounded-xl text-stone-200 font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Upload className="w-4 h-4 text-amber-400" />
                  Upload Photo for Cover
                </button>
                <button
                  id="generate-procedural-art-btn"
                  type="button"
                  onClick={generateProceduralArtwork}
                  disabled={isGeneratingArtwork}
                  className="py-2.5 px-3 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-700/50 rounded-xl text-amber-300 font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  title="Generate synthetic theme backdrop"
                >
                  <Sparkles className={`w-4 h-4 ${isGeneratingArtwork ? 'animate-spin' : ''}`} />
                  {isGeneratingArtwork ? 'Generating...' : 'Theme Art'}
                </button>
              </div>

              {settings.imageUrl && (
                <div className="flex items-center justify-between p-2.5 bg-stone-950/60 rounded-xl border border-stone-800 text-stone-300">
                  <span className="truncate max-w-[200px] text-[11px] text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Photo Attached
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ imageUrl: null, imageBlob: null })}
                    className="text-[11px] text-stone-400 hover:text-red-400 transition-colors"
                  >
                    Remove Photo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Typography & Text Overlays */}
          {activeTab === 'text' && (
            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2 bg-stone-950/60 border border-stone-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.titleOverlay}
                    onChange={(e) => onUpdateSettings({ titleOverlay: e.target.checked })}
                    className="rounded border-stone-700 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-stone-300">Title & Author Overlay</span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-stone-950/60 border border-stone-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showBadge}
                    onChange={(e) => onUpdateSettings({ showBadge: e.target.checked })}
                    className="rounded border-stone-700 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-stone-300">Top Header Badge</span>
                </label>
              </div>

              {settings.showBadge && (
                <div className="space-y-1">
                  <span className="text-[11px] text-stone-400 font-medium">Badge Ribbon Text:</span>
                  <input
                    type="text"
                    value={settings.badgeText}
                    onChange={(e) => onUpdateSettings({ badgeText: e.target.value })}
                    placeholder="e.g. UNABRIDGED AUDIOBOOK"
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Font selector */}
              <div className="space-y-1">
                <span className="text-[11px] text-stone-400 font-medium">Typography Style:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['serif', 'sans', 'display', 'mono'] as const).map((font) => (
                    <button
                      key={font}
                      type="button"
                      onClick={() => onUpdateSettings({ fontFamily: font })}
                      className={`py-1 px-2 rounded-lg border text-xs capitalize transition-all ${
                        settings.fontFamily === font
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400 font-semibold'
                          : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {font}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Themes & Palettes */}
          {activeTab === 'presets' && (
            <div className="space-y-2 text-xs">
              <span className="text-[11px] text-stone-400 font-medium">Accent Color & Theme:</span>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onUpdateSettings({ themeColor: theme.color })}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                      settings.themeColor === theme.color
                        ? 'border-amber-400 bg-stone-800 ring-1 ring-amber-400'
                        : 'border-stone-800 bg-stone-950 hover:bg-stone-850'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full border border-stone-600 shadow-sm"
                      style={{ backgroundColor: theme.color }}
                    />
                    <span className="text-[10px] text-stone-300 truncate w-full text-center">
                      {theme.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Adjustments */}
          {activeTab === 'adjust' && (
            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                  <span>Brightness</span>
                  <span>{settings.brightness}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={settings.brightness}
                  onChange={(e) => onUpdateSettings({ brightness: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                  <span>Contrast</span>
                  <span>{settings.contrast}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={settings.contrast}
                  onChange={(e) => onUpdateSettings({ contrast: Number(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ brightness: 100, contrast: 100 })}
                  className="text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reset Adjustments
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
