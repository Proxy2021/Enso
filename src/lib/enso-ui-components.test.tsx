/**
 * Test: All 8 new EnsoUI components can be instantiated and the sandbox
 * compiler can compile templates that reference them.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { compileComponent } from "./sandbox";
import { EnsoUI } from "./enso-ui";

describe("EnsoUI new components exist in export", () => {
  const expected = [
    "Textarea", "Alert", "Avatar", "Timeline",
    "Skeleton", "DropdownMenu", "CheckboxGroup", "CodeBlock",
  ];

  for (const name of expected) {
    it(`EnsoUI.${name} is exported`, () => {
      expect((EnsoUI as Record<string, unknown>)[name]).toBeDefined();
      expect(typeof (EnsoUI as Record<string, unknown>)[name]).toBe("function");
    });
  }
});

describe("sandbox compiles templates using new components", () => {
  it("compiles a template with Textarea", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data, onAction }) {
        const [val, setVal] = useState("");
        return <Textarea value={val} onChange={setVal} placeholder="Type..." rows={4} />;
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with Alert", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data }) {
        return (
          <div>
            <Alert variant="info" title="Info">This is info</Alert>
            <Alert variant="danger" title="Error" dismissible>Something failed</Alert>
          </div>
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with Avatar", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data }) {
        return (
          <div className="flex gap-2">
            <Avatar name="Alice" size="sm" accent="blue" />
            <Avatar name="Bob Jones" size="md" />
            <Avatar src="https://example.com/photo.jpg" name="Charlie" size="lg" />
          </div>
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with Timeline", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data }) {
        const items = [
          { title: "Created", description: "Project started", time: "10:00", accent: "emerald" },
          { title: "Updated", description: "Added features", time: "11:30", accent: "blue" },
          { title: "Deployed", time: "14:00", accent: "violet" },
        ];
        return <Timeline items={items} />;
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with Skeleton", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data }) {
        return (
          <div className="space-y-2">
            <Skeleton variant="text" count={3} />
            <Skeleton variant="circle" width="3rem" height="3rem" />
            <Skeleton variant="rect" height="6rem" />
          </div>
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with DropdownMenu", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data, onAction }) {
        return (
          <DropdownMenu
            trigger={<Button>Actions</Button>}
            items={[
              { label: "Edit", onClick: () => onAction("edit", {}) },
              { label: "Delete", variant: "danger", onClick: () => onAction("delete", {}) },
            ]}
          />
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with CheckboxGroup", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data }) {
        const [selected, setSelected] = useState(["opt1"]);
        return (
          <CheckboxGroup
            label="Select options"
            options={[
              { value: "opt1", label: "Option 1" },
              { value: "opt2", label: "Option 2" },
              { value: "opt3", label: "Option 3", disabled: true },
            ]}
            value={selected}
            onChange={setSelected}
          />
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template with CodeBlock", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data }) {
        return (
          <CodeBlock
            code={"function hello() {\\n  return 'world';\\n}"}
            language="javascript"
            showLineNumbers
          />
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("compiles a template using ALL 8 new components together", () => {
    const result = compileComponent(`
      export default function GeneratedUI({ data, onAction }) {
        const [text, setText] = useState("");
        const [checks, setChecks] = useState([]);
        return (
          <div className="space-y-3">
            <Alert variant="success" title="Dashboard">All systems operational</Alert>
            <div className="flex gap-2 items-center">
              <Avatar name="Admin" size="sm" accent="violet" />
              <span className="text-xs text-gray-300">Admin Panel</span>
            </div>
            <Textarea value={text} onChange={setText} placeholder="Notes..." rows={3} maxLength={500} />
            <CheckboxGroup
              options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
              value={checks}
              onChange={setChecks}
            />
            <Timeline items={[{ title: "Start", time: "now", accent: "emerald" }]} />
            <Skeleton variant="text" count={2} />
            <DropdownMenu
              trigger={<Button variant="ghost">More</Button>}
              items={[{ label: "Refresh", onClick: () => onAction("refresh", {}) }]}
            />
            <CodeBlock code="const x = 1;" language="js" />
          </div>
        );
      }
    `);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });
});
