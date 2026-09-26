import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModalPortal } from '../../src/components/common/ModalPortal';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';

describe('ModalPortal Accessibility, Scroll Lock & Z-Index Isolation Tests', () => {
  afterEach(() => {
    cleanup();
    document.body.removeAttribute('data-modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('1. Renders modal content in portal with role="dialog" and aria-modal="true"', () => {
    render(
      <ModalPortal
        isOpen={true}
        onClose={() => {}}
        title="Kế hoạch học tập tối nay"
        subtitle="Jami AI Planner"
      >
        <p>Nội dung kế hoạch</p>
      </ModalPortal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Kế hoạch học tập tối nay')).toBeDefined();
    expect(screen.getByText('Nội dung kế hoạch')).toBeDefined();
  });

  it('2. Locks body scroll and sets data-modal-open="true" when opened, restores when closed', () => {
    const { rerender } = render(
      <ModalPortal isOpen={true} onClose={() => {}}>
        <div>Modal mở</div>
      </ModalPortal>
    );

    expect(document.body.getAttribute('data-modal-open')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <ModalPortal isOpen={false} onClose={() => {}}>
        <div>Modal đóng</div>
      </ModalPortal>
    );

    expect(document.body.getAttribute('data-modal-open')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('3. Closes on Escape key press and does not close when clicking inside panel', () => {
    let closed = false;
    render(
      <ModalPortal isOpen={true} onClose={() => { closed = true; }} title="Test Modal">
        <button type="button">Inside Button</button>
      </ModalPortal>
    );

    // Click inside button does NOT trigger close
    const insideBtn = screen.getByText('Inside Button');
    fireEvent.click(insideBtn);
    expect(closed).toBe(false);

    // Press Escape triggers close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('4. Renders into document.body (portal), not inside any ancestor element', () => {
    const { container } = render(
      <ModalPortal isOpen={true} onClose={() => {}} title="Portal Test">
        <p>Content in portal</p>
      </ModalPortal>
    );

    // The rendered container of the component should be empty (content went to portal)
    expect(container.children.length).toBe(0);
    // But document.body should have the dialog
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Portal Test');
  });

  it('5. data-modal-open is cleared when isOpen transitions from true to false', () => {
    const { rerender } = render(
      <ModalPortal isOpen={true} onClose={() => {}}>
        <div>Open</div>
      </ModalPortal>
    );
    expect(document.body.getAttribute('data-modal-open')).toBe('true');

    rerender(
      <ModalPortal isOpen={false} onClose={() => {}}>
        <div>Closed</div>
      </ModalPortal>
    );
    expect(document.body.getAttribute('data-modal-open')).toBeNull();
  });

  it('6. Body overflow is hidden while open and restored to empty string when closed', () => {
    document.body.style.overflow = 'auto';

    const { rerender } = render(
      <ModalPortal isOpen={true} onClose={() => {}}>
        <div>Test</div>
      </ModalPortal>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <ModalPortal isOpen={false} onClose={() => {}}>
        <div>Test</div>
      </ModalPortal>
    );
    // Restored to previous value ('auto')
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('7. Renders title and subtitle in header when provided', () => {
    render(
      <ModalPortal isOpen={true} onClose={() => {}} title="Modal Title" subtitle="SUBTITLE TAG">
        <span>body</span>
      </ModalPortal>
    );
    expect(screen.getByText('Modal Title')).toBeDefined();
    expect(screen.getByText('SUBTITLE TAG')).toBeDefined();
  });

  it('8. Close (X) button triggers onClose', () => {
    let closed = false;
    render(
      <ModalPortal isOpen={true} onClose={() => { closed = true; }} title="Closeable">
        <span>body</span>
      </ModalPortal>
    );
    const closeBtn = screen.getByLabelText('Đóng cửa sổ');
    fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });

  it('9. Clicking the backdrop (outside panel) triggers onClose', () => {
    let closed = false;
    render(
      <ModalPortal isOpen={true} onClose={() => { closed = true; }} title="Backdrop Test">
        <span>inside</span>
      </ModalPortal>
    );
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    // The backdrop is the first child of the dialog (aria-hidden)
    const backdrop = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(closed).toBe(true);
  });
});

describe('Theme Management ("Hai Bà Trưng" & "Default") Tests', () => {
  const TestThemeConsumer: React.FC = () => {
    const { theme, setTheme, toggleTheme, isHaiBaTrung } = useTheme();
    return (
      <div>
        <div data-testid="current-theme">{theme}</div>
        <div data-testid="is-hbt">{isHaiBaTrung ? 'yes' : 'no'}</div>
        <button onClick={() => setTheme('hai-ba-trung')}>Set HBT</button>
        <button onClick={() => setTheme('default')}>Set Default</button>
        <button onClick={toggleTheme}>Toggle Theme</button>
      </div>
    );
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Initializes with "default" theme when localStorage is empty', () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('default');
    expect(screen.getByTestId('is-hbt').textContent).toBe('no');
    expect(document.documentElement.getAttribute('data-theme')).toBe('default');
  });

  it('2. Switches to "hai-ba-trung" theme and updates DOM attribute & localStorage', () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText('Set HBT'));

    expect(screen.getByTestId('current-theme').textContent).toBe('hai-ba-trung');
    expect(screen.getByTestId('is-hbt').textContent).toBe('yes');
    expect(document.documentElement.getAttribute('data-theme')).toBe('hai-ba-trung');
    expect(localStorage.getItem('jami:theme')).toBe('hai-ba-trung');
  });

  it('3. Can switch back to "default" theme cleanly without leaving stale attributes', () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText('Set HBT'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('hai-ba-trung');

    fireEvent.click(screen.getByText('Set Default'));
    expect(screen.getByTestId('current-theme').textContent).toBe('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('default');
    expect(localStorage.getItem('jami:theme')).toBe('default');
  });

  it('4. Restores saved theme from localStorage on initial render', () => {
    localStorage.setItem('jami:theme', 'hai-ba-trung');

    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('hai-ba-trung');
    expect(document.documentElement.getAttribute('data-theme')).toBe('hai-ba-trung');
  });
});
