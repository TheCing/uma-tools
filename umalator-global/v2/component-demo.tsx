/**
 * v2 Component Demo Page
 *
 * Showcases all v2 UI components in isolation for testing and development.
 * Run with: cd umalator-global/v2 && npx vite --open /component-demo.html
 */

import { h, render } from "preact";
import { useState } from "preact/hooks";
import {
  CustomSelect,
  Dropdown,
  Modal,
  Button,
  ChevronDown,
  Save,
  Download,
  Settings,
  Trash2,
  Play,
  BarChart3,
  GitCompare,
  Sun,
  Moon,
  Hash,
  Zap,
} from "./components";

import "./v2.css";

function ComponentDemo() {
  const [darkMode, setDarkMode] = useState(true);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testSelectValue, setTestSelectValue] = useState<string | number>("option1");

  return (
    <div id="app-v2" class={darkMode ? "" : "light"} style={{ minHeight: '100vh', padding: 'var(--space-xl)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
          <h1 style={{ margin: 0, color: 'var(--color-text-primary)' }}>v2 Component Library</h1>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>
            <input
              type="checkbox"
              checked={!darkMode}
              onChange={(e) => setDarkMode(!e.currentTarget.checked)}
            />
            Light Mode
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {/* Custom Select Section */}
          <section style={{ background: 'var(--color-bg-surface)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-primary)', fontSize: '1.25rem' }}>CustomSelect</h2>
            <p style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Dropdown select with portal rendering for proper z-index in modals.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Default</span>
                <CustomSelect
                  value={testSelectValue}
                  onChange={setTestSelectValue}
                  options={[
                    { value: 'option1', label: 'Option One' },
                    { value: 'option2', label: 'Option Two' },
                    { value: 'option3', label: 'Option Three' },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>With Disabled Option</span>
                <CustomSelect
                  value={testSelectValue}
                  onChange={setTestSelectValue}
                  options={[
                    { value: 'option1', label: 'Option One' },
                    { value: 'option2', label: 'Option Two' },
                    { value: 'disabled', label: 'Disabled Option', disabled: true },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Disabled</span>
                <CustomSelect
                  value={testSelectValue}
                  onChange={setTestSelectValue}
                  options={[
                    { value: 'option1', label: 'Option One' },
                  ]}
                  disabled
                />
              </div>
            </div>
          </section>

          {/* Button Section */}
          <section style={{ background: 'var(--color-bg-surface)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-primary)', fontSize: '1.25rem' }}>Button</h2>
            <p style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Button variants with optional icons.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              {/* Variants */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-sm)' }}>Variants</span>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </div>
              </div>

              {/* With Icons */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-sm)' }}>With Icons</span>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <Button variant="primary" icon={<Play size={14} />}>Play</Button>
                  <Button variant="secondary" icon={<Settings size={14} />}>Settings</Button>
                  <Button variant="ghost" icon={<Save size={14} />}>Save</Button>
                  <Button variant="danger" icon={<Trash2 size={14} />}>Delete</Button>
                </div>
              </div>

              {/* Icon Position */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-sm)' }}>Icon Position</span>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <Button variant="secondary" icon={<Download size={14} />} iconPosition="left">Download</Button>
                  <Button variant="secondary" icon={<ChevronDown size={14} />} iconPosition="right">Dropdown</Button>
                </div>
              </div>

              {/* Sizes */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-sm)' }}>Sizes</span>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                </div>
              </div>

              {/* Disabled */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-sm)' }}>Disabled</span>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <Button variant="primary" disabled>Primary</Button>
                  <Button variant="secondary" disabled>Secondary</Button>
                  <Button variant="ghost" disabled>Ghost</Button>
                  <Button variant="danger" disabled>Danger</Button>
                </div>
              </div>
            </div>
          </section>

          {/* Dropdown Section */}
          <section style={{ background: 'var(--color-bg-surface)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-primary)', fontSize: '1.25rem' }}>Dropdown</h2>
            <p style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Dropdown menu with icons, dividers, and danger items.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>With Icons</span>
                <Dropdown
                  trigger={<Button variant="secondary" icon={<ChevronDown size={14} />} iconPosition="right">Actions</Button>}
                  items={[
                    { id: 'save', label: 'Save', icon: <Save size={16} />, onClick: () => alert('Save clicked') },
                    { id: 'export', label: 'Export', icon: <Download size={16} />, onClick: () => alert('Export clicked') },
                    { id: 'divider1', label: '', divider: true },
                    { id: 'settings', label: 'Settings', icon: <Settings size={16} />, onClick: () => alert('Settings clicked') },
                    { id: 'divider2', label: '', divider: true },
                    { id: 'delete', label: 'Delete', icon: <Trash2 size={16} />, danger: true, onClick: () => alert('Delete clicked') },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Simple</span>
                <Dropdown
                  trigger={<Button variant="ghost">Menu</Button>}
                  items={[
                    { id: 'item1', label: 'Item One', onClick: () => alert('Item 1') },
                    { id: 'item2', label: 'Item Two', onClick: () => alert('Item 2') },
                    { id: 'item3', label: 'Item Three', onClick: () => alert('Item 3') },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Right Aligned</span>
                <Dropdown
                  trigger={<Button variant="secondary">Right</Button>}
                  align="right"
                  items={[
                    { id: 'item1', label: 'Aligned Right', onClick: () => {} },
                    { id: 'item2', label: 'Another Item', onClick: () => {} },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* Modal Section */}
          <section style={{ background: 'var(--color-bg-surface)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-primary)', fontSize: '1.25rem' }}>Modal</h2>
            <p style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Modal dialog with header, body, and footer. CustomSelect works inside via portal rendering.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <Button variant="primary" onClick={() => setTestModalOpen(true)}>Open Modal</Button>
            </div>
          </section>
        </div>
      </div>

      {/* Test Modal */}
      <Modal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title="Test Modal"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTestModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setTestModalOpen(false)}>Confirm</Button>
          </>
        }
      >
        <p style={{ margin: '0 0 var(--space-md) 0', color: 'var(--color-text-secondary)' }}>
          This is a test modal with a header, body content, and footer actions.
          You can close it by clicking the X button, the backdrop, pressing Escape, or clicking Cancel/Confirm.
        </p>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-xs)' }}>
            CustomSelect in Modal (portal test)
          </span>
          <CustomSelect
            value={testSelectValue}
            onChange={setTestSelectValue}
            options={[
              { value: 'option1', label: 'Select inside modal' },
              { value: 'option2', label: 'Another option' },
              { value: 'option3', label: 'Third option' },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}

render(<ComponentDemo />, document.getElementById("app")!);
