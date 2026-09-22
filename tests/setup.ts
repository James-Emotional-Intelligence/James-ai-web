import '@testing-library/jest-dom/vitest';

// Ensure test runner isolates from external OpenAI live network calls
process.env.OPENAI_API_KEY = '';

// Global Web Speech Mocks for testing environment
if (typeof global !== 'undefined') {
  if (!global.SpeechSynthesisUtterance) {
    (global as any).SpeechSynthesisUtterance = class {
      public text: string;
      public lang = 'vi-VN';
      public rate = 1;
      public pitch = 1;
      public voice = null;
      public onend: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      constructor(text: string = '') {
        this.text = text;
      }
    };
  }

  if (!global.speechSynthesis) {
    (global as any).speechSynthesis = {
      speak: (utterance: any) => {
        if (utterance?.onend) setTimeout(utterance.onend, 10);
      },
      cancel: () => {},
      getVoices: () => [],
    };
  }
}
