class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Keep it from blowing ears
        this.masterGain.connect(this.ctx.destination);

        this.isPlaying = false;
        this.bpm = 140;
        this.noteTime = 60 / this.bpm / 4; // 16th notes
        this.nextNoteTime = 0;
        this.sequenceIndex = 0;

        // "Keygen" style arpeggio sequence (C Minor roughly)
        // Frequencies in Hz for a C minor arpeggio pattern
        this.sequence = [
            261.63, 311.13, 392.00, 523.25, // C4, Eb4, G4, C5
            311.13, 392.00, 523.25, 622.25, // Eb4, G4, C5, Eb5
            392.00, 523.25, 622.25, 783.99, // G4, C5, Eb5, G5
            523.25, 392.00, 311.13, 261.63  // Down
        ];
    }

    init() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(freq, duration, type = 'square', vol = 0.1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // Scheduler for the music loop
    scheduleNote() {
        if (!this.isPlaying) return;

        const secondsPerBeat = 60.0 / this.bpm;
        const noteLength = 0.25; // 16th note basically

        // Lookahead
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playNote(this.nextNoteTime);
            this.nextNoteTime += (secondsPerBeat * noteLength);
        }

        requestAnimationFrame(() => this.scheduleNote());
    }

    playNote(time) {
        if (!this.isPlaying) return;

        // Main Arp
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const freq = this.sequence[this.sequenceIndex % this.sequence.length];

        // Slight detune for that "thick" retro sound
        osc.frequency.setValueAtTime(freq, time);
        osc.type = 'square';

        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.1);

        // Bassline (every 4 notes)
        if (this.sequenceIndex % 4 === 0) {
            this.playBass(time);
        }

        this.sequenceIndex++;
    }

    playBass(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(65.41, time); // C2
        osc.type = 'sawtooth';

        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.3);
    }

    startMusic() {
        if (this.isPlaying) return;
        this.init();
        this.isPlaying = true;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduleNote();
    }

    stopMusic() {
        this.isPlaying = false;
    }

    // SFX
    playCollect() {
        // High pitch "ding"
        this.playTone(1200, 0.1, 'sine', 0.2);
        setTimeout(() => this.playTone(1800, 0.2, 'square', 0.1), 50);
    }

    playCrash() {
        // Noise buffer or just low chaotic waves
        const duration = 0.5;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    increaseTempo() {
        if (this.bpm < 200) this.bpm += 5;
    }
}

// Export a singleton
const audioManager = new SoundManager();
