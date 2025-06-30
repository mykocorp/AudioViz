import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Mic, MicOff, Settings, Download, Maximize } from 'lucide-react';

interface VisualizerConfig {
  mode: 'bars' | 'waveform' | 'oscillator' | 'circular' | 'particles' | 'ascii' | 'matrix' | 'predator' | 'radial' | 'spectrum3d';
  style: 'rainbow' | 'neon' | 'fire' | 'ocean' | 'minimal' | 'retro';
  fftSize: number;
  fade: number;
  sensitivity: number;
  smoothing: number;
  particleCount: number;
  beatDetection: boolean;
  showFreqLabels: boolean;
  asciiDensity: number;
}

const VISUALIZATION_MODES = [
  { value: 'bars', label: 'Frequency Bars' },
  { value: 'waveform', label: 'Waveform' },
  { value: 'oscillator', label: 'Oscilloscope' },
  { value: 'circular', label: 'Circular Wave' },
  { value: 'particles', label: 'Particle System' },
  { value: 'ascii', label: 'ASCII Ocean Wave' },
  { value: 'matrix', label: 'ASCII Matrix Rain' },
  { value: 'predator', label: 'ASCII Predator Vision' },
  { value: 'radial', label: 'Radial Burst' },
  { value: 'spectrum3d', label: '3D Spectrum' }
];

const COLOR_SCHEMES = [
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'neon', label: 'Neon Glow' },
  { value: 'fire', label: 'Fire' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'retro', label: 'Retro Wave' }
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  frequency: number;
}

interface MatrixDrop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
  intensity: number;
}

// ASCII characters for different effects
const ASCII_CHARS = ['█', '▓', '▒', '░', '▪', '▫', '·', '˙', ' '];
const WAVE_CHARS = ['~', '≈', '∼', '⌐', '¬', '∩', '∪', '◊', '○', '●', '▲', '▼', '◄', '►'];
const MATRIX_CHARS = ['0', '1', 'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ', 'マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ワ', 'ヲ', 'ン'];
const PREDATOR_CHARS = ['█', '▓', '▒', '░', '▪', '▫', '·', '˙', '○', '●', '◊', '◦', '∘', '∙', '•'];

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [config, setConfig] = useState<VisualizerConfig>({
    mode: 'bars',
    style: 'rainbow',
    fftSize: 256,
    fade: 0.2,
    sensitivity: 1,
    smoothing: 0.8,
    particleCount: 100,
    beatDetection: true,
    showFreqLabels: false,
    asciiDensity: 20
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const beatHistoryRef = useRef<number[]>([]);
  const asciiGridRef = useRef<string[][]>([]);
  const matrixDropsRef = useRef<MatrixDrop[]>([]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Reinitialize grids when canvas resizes
    initializeAsciiGrid();
    initializeMatrixDrops();
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const initializeAsciiGrid = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const cols = Math.floor(canvas.width / config.asciiDensity);
    const rows = Math.floor(canvas.height / config.asciiDensity);
    
    asciiGridRef.current = [];
    for (let y = 0; y < rows; y++) {
      asciiGridRef.current[y] = [];
      for (let x = 0; x < cols; x++) {
        asciiGridRef.current[y][x] = ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
      }
    }
  };

  const initializeMatrixDrops = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const cols = Math.floor(canvas.width / config.asciiDensity);
    matrixDropsRef.current = [];
    
    for (let i = 0; i < cols; i++) {
      if (Math.random() > 0.7) { // Not every column has a drop initially
        matrixDropsRef.current.push({
          x: i,
          y: -Math.random() * 20,
          speed: Math.random() * 3 + 1,
          chars: Array.from({ length: Math.floor(Math.random() * 15) + 5 }, () => 
            MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
          ),
          length: Math.floor(Math.random() * 15) + 5,
          intensity: 0
        });
      }
    }
  };

  const setupAudioContext = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.fftSize = config.fftSize;
      analyserRef.current.smoothingTimeConstant = config.smoothing;
      
      sourceRef.current.connect(analyserRef.current);
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      // Initialize all effects
      initializeParticles();
      initializeAsciiGrid();
      initializeMatrixDrops();
      
      setIsActive(true);
      startVisualization();
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopAudioContext = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsActive(false);
  };

  const initializeParticles = () => {
    particlesRef.current = [];
    for (let i = 0; i < config.particleCount; i++) {
      particlesRef.current.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 1,
        maxLife: Math.random() * 100 + 50,
        frequency: Math.random()
      });
    }
  };

  const detectBeat = (dataArray: Uint8Array): boolean => {
    const sum = dataArray.reduce((acc, val) => acc + val, 0);
    const average = sum / dataArray.length;
    
    beatHistoryRef.current.push(average);
    if (beatHistoryRef.current.length > 20) {
      beatHistoryRef.current.shift();
    }
    
    const historicalAverage = beatHistoryRef.current.reduce((acc, val) => acc + val, 0) / beatHistoryRef.current.length;
    return average > historicalAverage * 1.3;
  };

  const getColorByStyle = (index: number, total: number, intensity: number): string => {
    const normalized = index / total;
    const alpha = Math.min(intensity / 255, 1);
    
    switch (config.style) {
      case 'rainbow':
        return `hsla(${normalized * 360}, 100%, 50%, ${alpha})`;
      case 'neon':
        const neonColors = ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5'];
        const colorIndex = Math.floor(normalized * neonColors.length);
        return neonColors[colorIndex] + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      case 'fire':
        return `hsla(${(1 - normalized) * 60}, 100%, ${50 + intensity / 5}%, ${alpha})`;
      case 'ocean':
        return `hsla(${180 + normalized * 60}, 100%, ${30 + intensity / 4}%, ${alpha})`;
      case 'retro':
        return `hsla(${300 + normalized * 60}, 80%, ${40 + intensity / 4}%, ${alpha})`;
      default:
        return `rgba(255, 255, 255, ${alpha})`;
    }
  };

  const getThermalColor = (intensity: number): string => {
    // Predator thermal vision colors: cold (blue) -> warm (red)
    const normalizedIntensity = Math.min(intensity / 255, 1);
    
    if (normalizedIntensity < 0.2) {
      // Cold - dark blue to blue
      return `rgb(0, 0, ${Math.floor(100 + normalizedIntensity * 155)})`;
    } else if (normalizedIntensity < 0.4) {
      // Cool - blue to cyan
      const t = (normalizedIntensity - 0.2) / 0.2;
      return `rgb(0, ${Math.floor(t * 255)}, 255)`;
    } else if (normalizedIntensity < 0.6) {
      // Warm - cyan to green
      const t = (normalizedIntensity - 0.4) / 0.2;
      return `rgb(0, 255, ${Math.floor(255 - t * 255)})`;
    } else if (normalizedIntensity < 0.8) {
      // Hot - green to yellow
      const t = (normalizedIntensity - 0.6) / 0.2;
      return `rgb(${Math.floor(t * 255)}, 255, 0)`;
    } else {
      // Very hot - yellow to red
      const t = (normalizedIntensity - 0.8) / 0.2;
      return `rgb(255, ${Math.floor(255 - t * 255)}, 0)`;
    }
  };

  const drawBars = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const barWidth = (ctx.canvas.width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = dataArray[i] * config.sensitivity * 2;
      
      ctx.fillStyle = getColorByStyle(i, dataArray.length, dataArray[i]);
      ctx.fillRect(x, ctx.canvas.height - barHeight, barWidth, barHeight);
      
      if (config.showFreqLabels && i % 20 === 0) {
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText(`${Math.round(i * 22050 / dataArray.length)}Hz`, x, ctx.canvas.height - barHeight - 5);
      }
      
      x += barWidth + 1;
    }
  };

  const drawAsciiWave = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const canvas = ctx.canvas;
    const cols = Math.floor(canvas.width / config.asciiDensity);
    const rows = Math.floor(canvas.height / config.asciiDensity);
    
    // Calculate average intensity for wave effect
    const totalIntensity = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    const waveStrength = (totalIntensity / 255) * config.sensitivity;
    
    ctx.font = `${config.asciiDensity - 4}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!asciiGridRef.current[y] || !asciiGridRef.current[y][x]) continue;
        
        const screenX = x * config.asciiDensity + config.asciiDensity / 2;
        const screenY = y * config.asciiDensity + config.asciiDensity / 2;
        
        // Create wave effect based on position and time
        const time = Date.now() * 0.001;
        const waveX = Math.sin(x * 0.1 + time * 2) * waveStrength * 20;
        const waveY = Math.cos(y * 0.1 + time * 1.5) * waveStrength * 15;
        
        // Get frequency data for this position
        const freqIndex = Math.floor((x / cols) * dataArray.length);
        const intensity = dataArray[freqIndex] || 0;
        
        // Choose character based on intensity and wave
        const waveIntensity = Math.abs(waveX + waveY) / 35;
        const totalIntensityNorm = (intensity / 255 + waveIntensity) / 2;
        
        let char;
        if (totalIntensityNorm > 0.7) {
          char = WAVE_CHARS[Math.floor(Math.random() * 4)]; // Dense wave chars
        } else if (totalIntensityNorm > 0.4) {
          char = ASCII_CHARS[Math.floor(totalIntensityNorm * 4)]; // Medium density
        } else if (totalIntensityNorm > 0.1) {
          char = ASCII_CHARS[Math.floor(totalIntensityNorm * 8)]; // Low density
        } else {
          char = Math.random() > 0.95 ? '·' : ' '; // Sparse dots
        }
        
        // Update grid with some randomness
        if (Math.random() > 0.9) {
          asciiGridRef.current[y][x] = char;
        }
        
        // Color based on intensity and position
        const colorIntensity = Math.max(50, intensity);
        ctx.fillStyle = getColorByStyle(x + y, cols + rows, colorIntensity);
        
        // Draw character with wave offset
        ctx.fillText(
          asciiGridRef.current[y][x],
          screenX + waveX,
          screenY + waveY
        );
      }
    }
  };

  const drawMatrixRain = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const canvas = ctx.canvas;
    const cols = Math.floor(canvas.width / config.asciiDensity);
    const rows = Math.floor(canvas.height / config.asciiDensity);
    
    // Calculate audio intensity to trigger new drops
    const totalIntensity = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    const audioStrength = (totalIntensity / 255) * config.sensitivity;
    
    ctx.font = `${config.asciiDensity - 2}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Update existing drops
    matrixDropsRef.current.forEach((drop, dropIndex) => {
      drop.y += drop.speed * (1 + audioStrength); // Speed increases with audio
      drop.intensity = audioStrength;
      
      // Draw the drop
      for (let i = 0; i < drop.length; i++) {
        const charY = drop.y - i;
        if (charY >= 0 && charY < rows) {
          const screenX = drop.x * config.asciiDensity + config.asciiDensity / 2;
          const screenY = charY * config.asciiDensity + config.asciiDensity / 2;
          
          // Fade effect - brighter at the head
          const alpha = Math.max(0.1, 1 - (i / drop.length));
          const intensity = Math.floor(255 * alpha * (0.5 + audioStrength));
          
          // Matrix green color with audio-reactive brightness
          if (config.style === 'minimal') {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          } else {
            ctx.fillStyle = `rgba(0, ${intensity}, 0, ${alpha})`;
          }
          
          // Change character occasionally for glitch effect
          if (Math.random() > 0.95) {
            drop.chars[i] = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          }
          
          ctx.fillText(drop.chars[i] || '0', screenX, screenY);
        }
      }
      
      // Remove drops that are off screen
      if (drop.y > rows + drop.length) {
        matrixDropsRef.current.splice(dropIndex, 1);
      }
    });
    
    // Create new drops based on audio intensity
    const newDropChance = audioStrength * 0.3; // Higher audio = more drops
    for (let col = 0; col < cols; col++) {
      if (Math.random() < newDropChance) {
        // Check if this column already has a recent drop
        const hasRecentDrop = matrixDropsRef.current.some(drop => 
          drop.x === col && drop.y < 5
        );
        
        if (!hasRecentDrop) {
          matrixDropsRef.current.push({
            x: col,
            y: 0,
            speed: Math.random() * 2 + 1 + audioStrength,
            chars: Array.from({ length: Math.floor(Math.random() * 20) + 5 }, () => 
              MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
            ),
            length: Math.floor(Math.random() * 20) + 5,
            intensity: audioStrength
          });
        }
      }
    }
  };

  const drawPredatorVision = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const canvas = ctx.canvas;
    const cols = Math.floor(canvas.width / config.asciiDensity);
    const rows = Math.floor(canvas.height / config.asciiDensity);
    
    ctx.font = `${config.asciiDensity - 4}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Create thermal noise pattern
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const screenX = x * config.asciiDensity + config.asciiDensity / 2;
        const screenY = y * config.asciiDensity + config.asciiDensity / 2;
        
        // Get frequency data for this position
        const freqIndex = Math.floor((x / cols) * dataArray.length);
        const baseIntensity = dataArray[freqIndex] || 0;
        
        // Add thermal noise and wave patterns
        const time = Date.now() * 0.001;
        const thermalNoise = Math.sin(x * 0.3 + time) * Math.cos(y * 0.2 + time * 0.7) * 30;
        const heatWave = Math.sin((x + y) * 0.1 + time * 3) * 20;
        
        // Combine audio data with thermal effects
        const totalIntensity = Math.max(0, Math.min(255, 
          baseIntensity * config.sensitivity + thermalNoise + heatWave + Math.random() * 20
        ));
        
        // Choose character based on thermal intensity
        const thermalLevel = totalIntensity / 255;
        let char;
        
        if (thermalLevel > 0.8) {
          char = PREDATOR_CHARS[0]; // Hottest - solid block
        } else if (thermalLevel > 0.6) {
          char = PREDATOR_CHARS[Math.floor(Math.random() * 3)]; // Hot
        } else if (thermalLevel > 0.4) {
          char = PREDATOR_CHARS[Math.floor(Math.random() * 6) + 3]; // Warm
        } else if (thermalLevel > 0.2) {
          char = PREDATOR_CHARS[Math.floor(Math.random() * 4) + 8]; // Cool
        } else {
          char = Math.random() > 0.8 ? PREDATOR_CHARS[PREDATOR_CHARS.length - 1] : ' '; // Cold
        }
        
        // Use thermal color scheme
        ctx.fillStyle = getThermalColor(totalIntensity);
        
        // Add scanline effect
        if (y % 3 === 0) {
          ctx.globalAlpha = 0.7;
        } else {
          ctx.globalAlpha = 1;
        }
        
        ctx.fillText(char, screenX, screenY);
      }
    }
    
    ctx.globalAlpha = 1; // Reset alpha
    
    // Add predator HUD overlay
    ctx.strokeStyle = getThermalColor(200);
    ctx.lineWidth = 2;
    
    // Crosshair in center
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const crossSize = 20;
    
    ctx.beginPath();
    ctx.moveTo(centerX - crossSize, centerY);
    ctx.lineTo(centerX + crossSize, centerY);
    ctx.moveTo(centerX, centerY - crossSize);
    ctx.lineTo(centerX, centerY + crossSize);
    ctx.stroke();
    
    // Corner brackets
    const bracketSize = 30;
    const margin = 50;
    
    // Top-left
    ctx.beginPath();
    ctx.moveTo(margin, margin + bracketSize);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + bracketSize, margin);
    ctx.stroke();
    
    // Top-right
    ctx.beginPath();
    ctx.moveTo(canvas.width - margin - bracketSize, margin);
    ctx.lineTo(canvas.width - margin, margin);
    ctx.lineTo(canvas.width - margin, margin + bracketSize);
    ctx.stroke();
    
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(margin, canvas.height - margin - bracketSize);
    ctx.lineTo(margin, canvas.height - margin);
    ctx.lineTo(margin + bracketSize, canvas.height - margin);
    ctx.stroke();
    
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(canvas.width - margin - bracketSize, canvas.height - margin);
    ctx.lineTo(canvas.width - margin, canvas.height - margin);
    ctx.lineTo(canvas.width - margin, canvas.height - margin - bracketSize);
    ctx.stroke();
  };

  const drawParticles = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    
    particlesRef.current.forEach((particle, index) => {
      const frequencyIndex = Math.floor(particle.frequency * dataArray.length);
      const intensity = dataArray[frequencyIndex] || 0;
      
      // Update particle based on audio data
      const force = intensity / 255 * config.sensitivity;
      particle.x += particle.vx + Math.cos(Date.now() * 0.001 + index) * force;
      particle.y += particle.vy + Math.sin(Date.now() * 0.001 + index) * force;
      
      // Wrap around screen
      if (particle.x < 0) particle.x = ctx.canvas.width;
      if (particle.x > ctx.canvas.width) particle.x = 0;
      if (particle.y < 0) particle.y = ctx.canvas.height;
      if (particle.y > ctx.canvas.height) particle.y = 0;
      
      // Draw particle
      const size = Math.max(1, force * 10);
      ctx.fillStyle = getColorByStyle(index, particlesRef.current.length, intensity);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Connect to center with intensity
      if (force > 0.1) {
        ctx.strokeStyle = getColorByStyle(index, particlesRef.current.length, intensity * 0.3);
        ctx.lineWidth = force * 2;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(centerX, centerY);
        ctx.stroke();
      }
    });
  };

  const drawRadialBurst = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const numRays = Math.min(dataArray.length, 64);
    
    for (let i = 0; i < numRays; i++) {
      const angle = (i / numRays) * Math.PI * 2;
      const intensity = dataArray[Math.floor(i * dataArray.length / numRays)] / 255;
      const length = intensity * config.sensitivity * 300;
      
      const x1 = centerX + Math.cos(angle) * 20;
      const y1 = centerY + Math.sin(angle) * 20;
      const x2 = centerX + Math.cos(angle) * (20 + length);
      const y2 = centerY + Math.sin(angle) * (20 + length);
      
      ctx.strokeStyle = getColorByStyle(i, numRays, dataArray[Math.floor(i * dataArray.length / numRays)]);
      ctx.lineWidth = Math.max(1, intensity * 5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };

  const draw3DSpectrum = (ctx: CanvasRenderingContext2D, dataArray: Uint8Array) => {
    const perspective = 400;
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    
    for (let i = 0; i < dataArray.length; i++) {
      const x = (i - dataArray.length / 2) * 8;
      const height = dataArray[i] * config.sensitivity * 2;
      const z = Math.sin(Date.now() * 0.001 + i * 0.1) * 100;
      
      // Simple 3D projection
      const scale = perspective / (perspective + z);
      const projectedX = centerX + x * scale;
      const projectedY = centerY - height * scale * 0.5;
      const projectedHeight = height * scale;
      
      ctx.fillStyle = getColorByStyle(i, dataArray.length, dataArray[i]);
      ctx.fillRect(projectedX - 2, projectedY, 4, projectedHeight);
    }
  };

  const startVisualization = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !analyserRef.current || !dataArrayRef.current) return;

    const animate = () => {
      if (config.mode === 'bars' || config.mode === 'spectrum3d' || config.mode === 'ascii' || config.mode === 'matrix' || config.mode === 'predator') {
        analyserRef.current!.getByteFrequencyData(dataArrayRef.current!);
      } else {
        analyserRef.current!.getByteTimeDomainData(dataArrayRef.current!);
      }

      // Apply fade effect (except for matrix mode which handles its own background)
      if (config.mode !== 'matrix') {
        ctx.fillStyle = `rgba(0, 0, 0, ${config.fade})`;
        ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      }

      const isBeat = config.beatDetection && detectBeat(dataArrayRef.current!);
      
      // Beat reaction - screen flash (except for predator mode)
      if (isBeat && config.style !== 'minimal' && config.mode !== 'predator') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      }

      switch (config.mode) {
        case 'bars':
          drawBars(ctx, dataArrayRef.current!);
          break;
        case 'ascii':
          drawAsciiWave(ctx, dataArrayRef.current!);
          break;
        case 'matrix':
          // Matrix mode needs full black background each frame
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.fillRect(0, 0, canvas!.width, canvas!.height);
          drawMatrixRain(ctx, dataArrayRef.current!);
          break;
        case 'predator':
          // Predator mode draws its own background
          ctx.fillStyle = 'rgba(0, 0, 0, 1)';
          ctx.fillRect(0, 0, canvas!.width, canvas!.height);
          drawPredatorVision(ctx, dataArrayRef.current!);
          break;
        case 'particles':
          drawParticles(ctx, dataArrayRef.current!);
          break;
        case 'radial':
          drawRadialBurst(ctx, dataArrayRef.current!);
          break;
        case 'spectrum3d':
          draw3DSpectrum(ctx, dataArrayRef.current!);
          break;
        case 'circular':
          // Keep original circular logic
          const centerX = canvas!.width / 2;
          const centerY = canvas!.height / 2;
          const radius = Math.min(canvas!.width, canvas!.height) / 4;
          ctx.beginPath();
          for (let i = 0; i < dataArrayRef.current!.length; i++) {
            const angle = (i / dataArrayRef.current!.length) * 2 * Math.PI;
            const r = radius + (dataArrayRef.current![i] - 128) * config.sensitivity;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = getColorByStyle(0, 1, 200);
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case 'oscillator':
        case 'waveform':
          // Keep original oscillator/waveform logic
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = getColorByStyle(0, 1, 200);
          const sliceWidth = canvas!.width / dataArrayRef.current!.length;
          let x = 0;
          for (let i = 0; i < dataArrayRef.current!.length; i++) {
            const v = dataArrayRef.current![i] / 128.0;
            const y = (v - 1) * canvas!.height / 2 * config.sensitivity + canvas!.height / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          break;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const updateConfig = (key: keyof VisualizerConfig, value: any) => {
    setConfig(prev => {
      const newConfig = { ...prev, [key]: value };
      
      // Update analyser settings immediately without animation
      if (analyserRef.current) {
        if (key === 'fftSize') {
          try {
            analyserRef.current.fftSize = value;
            const bufferLength = analyserRef.current.frequencyBinCount;
            dataArrayRef.current = new Uint8Array(bufferLength);
          } catch (error) {
            console.error('Error updating FFT size:', error);
            // Revert to previous value if invalid
            return prev;
          }
        }
        if (key === 'smoothing') {
          analyserRef.current.smoothingTimeConstant = value;
        }
      }
      
      // Reinitialize particles if count changed
      if (key === 'particleCount') {
        initializeParticles();
      }
      
      // Reinitialize grids if density changed
      if (key === 'asciiDensity') {
        initializeAsciiGrid();
        initializeMatrixDrops();
      }
      
      return newConfig;
    });
  };

  const downloadFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `visualizer-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor: showControls ? 'default' : 'none' }}
        onClick={() => setShowControls(!showControls)}
      />
      
      {showControls && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md rounded-lg p-4 text-white min-w-[300px]">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={isActive ? stopAudioContext : setupAudioContext}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {isActive ? <Pause size={16} /> : <Play size={16} />}
              {isActive ? 'Stop' : 'Start'} Visualizer
            </button>
            <button
              onClick={() => setShowControls(!showControls)}
              className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={downloadFrame}
              className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
              disabled={!isActive}
            >
              <Download size={16} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Maximize size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Visualization Mode</label>
              <select
                value={config.mode}
                onChange={(e) => updateConfig('mode', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              >
                {VISUALIZATION_MODES.map(mode => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Color Style</label>
              <select
                value={config.style}
                onChange={(e) => updateConfig('style', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              >
                {COLOR_SCHEMES.map(style => (
                  <option key={style.value} value={style.value}>{style.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                FFT Size: {config.fftSize}
              </label>
              <input
                type="range"
                min="64"
                max="2048"
                step="64"
                value={config.fftSize}
                onChange={(e) => updateConfig('fftSize', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Sensitivity: {config.sensitivity.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={config.sensitivity}
                onChange={(e) => updateConfig('sensitivity', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Fade: {config.fade.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={config.fade}
                onChange={(e) => updateConfig('fade', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Smoothing: {config.smoothing.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={config.smoothing}
                onChange={(e) => updateConfig('smoothing', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            {config.mode === 'particles' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Particles: {config.particleCount}
                </label>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="10"
                  value={config.particleCount}
                  onChange={(e) => updateConfig('particleCount', parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {(config.mode === 'ascii' || config.mode === 'matrix' || config.mode === 'predator') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  ASCII Density: {config.asciiDensity}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="40"
                  step="2"
                  value={config.asciiDensity}
                  onChange={(e) => updateConfig('asciiDensity', parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.beatDetection}
                onChange={(e) => updateConfig('beatDetection', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Beat Detection</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.showFreqLabels}
                onChange={(e) => updateConfig('showFreqLabels', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Frequency Labels</span>
            </label>
          </div>
        </div>
      )}

      {!showControls && (
        <div className="absolute bottom-4 left-4 text-white/50 text-sm">
          Click anywhere to show controls
        </div>
      )}

      {/* Bolt.new branding */}
      <a
        href="https://bolt.new"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 z-50 transition-all duration-200 hover:scale-110"
        title="Built with Bolt.new"
      >
        <img
          src="https://github.com/kickiniteasy/bolt-hackathon-badge/blob/main/src/public/bolt-badge/white_circle_360x360/white_circle_360x360.png?raw=true"
          alt="Built with Bolt.new"
          className="w-12 h-12 drop-shadow-lg"
        />
      </a>
    </div>
  );
}