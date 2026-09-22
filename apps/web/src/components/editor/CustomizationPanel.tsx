"use client";

/**
 * Right-hand customization panel. Renders entirely from category metadata:
 * part categories get asset grids per slot, socket categories get asset
 * grids per socket, and hands/pose/materials/base render dedicated panels.
 */
import { useMemo, useState } from "react";
import {
  armOptionsFor,
  coveredFeatures,
  customerFacingIssues,
  getAsset,
  listAssets,
  presentationsOf,
  resolveCharacterPresentation,
  DIVINE_FORM_CATEGORY,
  type EditorCategory,
} from "@devaform/asset-system";
import { useDeity } from "@/state/deityContext";
import {
  FACE_MORPHS,
  activeArmSlots,
  getSocket,
  type PartSlot,
  type SocketId,
} from "@devaform/character-schema";
import { resolveAssetRef } from "@devaform/asset-system";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";
import { AssetGrid } from "./AssetGrid";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { SliderControl } from "@/components/controls/SliderControl";
import { BasePanel } from "./panels/BasePanel";
import { DivineFormPanel } from "./panels/DivineFormPanel";
import { HandsPanel } from "./panels/HandsPanel";
import { MaterialsPanel } from "./panels/MaterialsPanel";
import { JointGroupSection, PosePresetsSection } from "./panels/PosePanel";

const SLOT_LABELS: Record<PartSlot, string> = {
  body: "Body",
  head: "Head",
  eyes: "Eyes",
  ears: "Ears",
  trunk: "Trunk",
  tusks: "Tusks",
  hair: "Hair",
  hands: "Hand Style",
  lowerGarment: "Dhoti",
  upperGarment: "Upper Garment",
  earrings: "Earrings",
  armlets: "Armlets",
  bracelets: "Bracelets",
  anklets: "Anklets",
};

/** Slots the user may intentionally leave empty. */
const OPTIONAL_SLOTS: readonly PartSlot[] = [
  "upperGarment",
  "hair",
  "earrings",
  "armlets",
  "bracelets",
  "anklets",
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 first:mt-0">
      {children}
    </h3>
  );
}

function PartSlotSection({ slot }: { slot: PartSlot }) {
  const config = useEditorStore((s) => s.config);
  const selected = config.parts[slot];
  const setPart = useEditorStore((s) => s.setPart);
  const assets = listAssets({ deity: config.deity, slot });
  // A body that is one continuous mesh brings its own head, face, eyes
  // and hands. An empty picker in front of a figure whose head is part of
  // its body is not a customisation, so the slot says what has it instead.
  const covered = coveredFeatures(config);
  if (covered.features.has(slot)) {
    return (
      <section>
        <SectionHeading>{SLOT_LABELS[slot]}</SectionHeading>
        <p className="text-[11px] text-stone-500">
          Part of {covered.provider?.name ?? "the selected body"} — choose a different
          body to swap it.
        </p>
      </section>
    );
  }
  if (assets.length === 0 && !selected) return null;
  return (
    <section>
      <SectionHeading>{SLOT_LABELS[slot]}</SectionHeading>
      <AssetGrid
        assets={assets}
        selectedAssetId={selected?.assetId ?? null}
        allowNone={OPTIONAL_SLOTS.includes(slot)}
        onSelect={(assetId) => setPart(slot, assetId)}
      />
    </section>
  );
}

const BODY_VARIANT_MORPHS = new Set([
  "bodyLean",
  "bodyAthletic",
  "bodyPowerful",
  "bodyHeroic",
  "bodyAscetic",
]);

/**
 * Build, as a choice between silhouettes rather than a row of sliders.
 *
 * `references/ref3.png` shows Classic, Ascetic and Mahayogi as three
 * builds of one figure — which is what they are, morph weights on one
 * mesh. The customer chooses the silhouette; the weights are an
 * implementation detail they should never have to assemble by hand.
 */
function BodyVariantSection() {
  const deity = useDeity();
  const morphs = useEditorStore((s) => s.config.morphs);
  const parts = useEditorStore((s) => s.config.parts);
  const setMorph = useEditorStore((s) => s.setMorph);
  const variants = deity.bodyVariants ?? [];
  const exposed = new Set(resolveAssetRef(parts.body)?.morphTargets ?? []);
  // Only offer builds the selected body can actually take.
  const available = variants.filter((variant) =>
    Object.keys(variant.morphs).some((name) => exposed.has(name)),
  );
  if (available.length < 2) return null;
  const matches = (variant: (typeof available)[number]) =>
    [...BODY_VARIANT_MORPHS].every(
      (name) => Math.abs((morphs[name] ?? 0) - (variant.morphs[name] ?? 0)) < 1e-6,
    );
  const active = available.find(matches);
  return (
    <section>
      <SectionHeading>Build</SectionHeading>
      <SegmentedControl<string>
        options={available.map((variant) => ({ value: variant.id, label: variant.label }))}
        value={active?.id ?? ""}
        onChange={(id) => {
          const chosen = available.find((variant) => variant.id === id);
          if (!chosen) return;
          // Clear the build morphs this deity knows about, then set the
          // variant's — so switching builds cannot leave a trace of the
          // previous one behind.
          for (const name of BODY_VARIANT_MORPHS) setMorph(name, 0);
          for (const [name, value] of Object.entries(chosen.morphs)) setMorph(name, value);
        }}
      />
      <p className="mt-2 text-[11px] text-stone-500">
        {active?.description ?? "Custom build."}
      </p>
    </section>
  );
}

/**
 * Fine placement controls for an attached item — position (cm), rotation
 * and scale offsets layered over the asset's default transform. Upright
 * items keep their world-vertical orientation, so rotation is hidden for
 * them rather than pretending it works.
 */
function AttachmentAdjust({ socket }: { socket: SocketId }) {
  const attachment = useEditorStore((s) =>
    s.config.attachments.find((a) => a.socket === socket),
  );
  const setAttachmentOffset = useEditorStore((s) => s.setAttachmentOffset);
  const [open, setOpen] = useState(false);
  if (!attachment) return null;
  const asset = getAsset(attachment.asset.assetId);
  // A presentation that holds the item world-upright owns its own turn;
  // the manual rotation slider would only fight it.
  const upright =
    asset !== undefined &&
    presentationsOf(asset).some((p) => p.orientation === "worldUpright");
  const offset = attachment.offset ?? {};
  const position = offset.position ?? [0, 0, 0];
  const rotationY = offset.rotation?.[1] ?? 0;
  const scale = offset.scale ?? 1;

  const update = (
    next: Partial<{ position: [number, number, number]; rotationY: number; scale: number }>,
  ) => {
    const p = next.position ?? (position as [number, number, number]);
    const rY = next.rotationY ?? rotationY;
    const s = next.scale ?? scale;
    const isDefault =
      p.every((v) => Math.abs(v) < 1e-4) && Math.abs(rY) < 1e-4 && Math.abs(s - 1) < 1e-4;
    setAttachmentOffset(
      socket,
      isDefault
        ? undefined
        : {
            position: p,
            ...(upright ? {} : { rotation: [0, rY, 0] as [number, number, number] }),
            scale: s,
          },
    );
  };

  const positionSlider = (axis: 0 | 1 | 2, label: string) => (
    <SliderControl
      label={label}
      value={(position[axis] ?? 0) * 100}
      min={-4}
      max={4}
      step={0.1}
      format={(v) => `${v.toFixed(1)} cm`}
      onChange={(cm) => {
        const p = [...position] as [number, number, number];
        p[axis] = cm / 100;
        update({ position: p });
      }}
    />
  );

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[11px] text-stone-500 underline-offset-2 hover:text-saffron-400 hover:underline"
      >
        {open ? "Hide placement adjustments" : "Adjust placement"}
      </button>
      {open && (
        <div className="mt-2 space-y-2.5 rounded-lg border border-surface-800 bg-surface-850 p-3">
          {positionSlider(0, "Left / Right")}
          {positionSlider(1, "Down / Up")}
          {positionSlider(2, "Back / Forward")}
          {!upright && (
            <SliderControl
              label="Turn"
              value={(rotationY * 180) / Math.PI}
              min={-180}
              max={180}
              step={1}
              format={(v) => `${Math.round(v)}°`}
              onChange={(deg) => update({ rotationY: (deg * Math.PI) / 180 })}
            />
          )}
          <SliderControl
            label="Size"
            value={scale}
            min={0.7}
            max={1.4}
            step={0.01}
            onChange={(s) => update({ scale: s })}
          />
          {/* Disabled when there is nothing to reset: a control that
              silently does nothing is worse than one that says so. */}
          <button
            type="button"
            disabled={attachment.offset === undefined}
            onClick={() => setAttachmentOffset(socket, undefined)}
            className="w-full rounded-md border border-surface-700 py-1 text-[11px] text-stone-400 transition-colors hover:border-stone-500 disabled:cursor-not-allowed disabled:border-surface-800 disabled:text-stone-600 disabled:hover:border-surface-800"
          >
            Reset placement
          </button>
        </div>
      )}
    </div>
  );
}

function SocketSection({ socket, allowNone }: { socket: SocketId; allowNone: boolean }) {
  const deity = useEditorStore((s) => s.config.deity);
  const attachment = useEditorStore((s) =>
    s.config.attachments.find((a) => a.socket === socket),
  );
  const setAttachment = useEditorStore((s) => s.setAttachment);
  const assets = listAssets({ deity, socket });
  if (assets.length === 0) return null;
  return (
    <section>
      <SectionHeading>{getSocket(socket).label}</SectionHeading>
      <AssetGrid
        assets={assets}
        selectedAssetId={attachment?.asset.assetId ?? null}
        allowNone={allowNone}
        onSelect={(assetId) => setAttachment(socket, assetId)}
      />
      {socket.endsWith(".hand.item") && (
        <p className="mt-1 text-[11px] text-stone-500">
          The hand adopts the item&apos;s grip automatically (see Hands).
        </p>
      )}
      <AttachmentAdjust socket={socket} />
    </section>
  );
}

function ProportionsSection() {
  const proportions = useEditorStore((s) => s.config.proportions);
  const setProportions = useEditorStore((s) => s.setProportions);
  return (
    <section>
      <SectionHeading>Proportions</SectionHeading>
      <div className="space-y-3">
        <SliderControl
          label="Height"
          value={proportions.height}
          min={0.8}
          max={1.2}
          onChange={(height) => setProportions({ height })}
        />
        <SliderControl
          label="Bulk"
          value={proportions.bulk}
          min={0.8}
          max={1.3}
          onChange={(bulk) => setProportions({ bulk })}
        />
      </div>
    </section>
  );
}

const ARM_OPTION_LABELS: Record<number, string> = {
  2: "Two Arms",
  4: "Four Arms (Chaturbhuja)",
};

function ArmCountSection() {
  const deity = useDeity();
  const arms = useEditorStore((s) => s.config.arms);
  const body = useEditorStore((s) => s.config.parts.body);
  const setArmCount = useEditorStore((s) => s.setArmCount);
  // What this BODY can render, not merely what the iconography allows.
  const options = armOptionsFor(deity, resolveAssetRef(body));
  if (options.length < 2) return null;
  return (
    <section>
      <SectionHeading>Arms</SectionHeading>
      <SegmentedControl<"2" | "4">
        options={options.map((count) => ({
          value: String(count) as "2" | "4",
          label: ARM_OPTION_LABELS[count] ?? `${count} Arms`,
        }))}
        value={String(arms.count) as "2" | "4"}
        onChange={(value) => setArmCount(Number(value) as 2 | 4)}
      />
      <p className="mt-2 text-[11px] text-stone-500">
        Items held by hidden back hands are kept and reappear with four arms.
      </p>
    </section>
  );
}

function FaceMorphSection() {
  const morphs = useEditorStore((s) => s.config.morphs);
  const parts = useEditorStore((s) => s.config.parts);
  const setMorph = useEditorStore((s) => s.setMorph);
  // Only offer morphs some selected part actually exposes — asset metadata
  // decides, so a deity without a trunk never shows trunk sliders.
  const exposed = new Set(
    Object.values(parts).flatMap((ref) => resolveAssetRef(ref)?.morphTargets ?? []),
  );
  const available = FACE_MORPHS.filter((m) => exposed.has(m.id));
  if (available.length === 0) return null;
  return (
    <section>
      <SectionHeading>Face Shaping</SectionHeading>
      <div className="space-y-3">
        {available.map((m) => (
          <SliderControl
            key={m.id}
            label={m.label}
            value={morphs[m.id] ?? 0}
            min={-1}
            max={1}
            step={0.05}
            onChange={(value) => setMorph(m.id, value)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Companion placement around the base. Offsets are applied on top of the
 * asset's default transform, so "Right" (the default) is a zero offset.
 */
const COMPANION_SPOTS: ReadonlyArray<{
  id: "right" | "front" | "left";
  label: string;
  offset: { position: [number, number, number] } | undefined;
}> = [
  { id: "right", label: "Right", offset: undefined },
  { id: "front", label: "Front", offset: { position: [-0.2, 0, 0.1] } },
  { id: "left", label: "Left", offset: { position: [-0.48, 0, -0.15] } },
];

function CompanionPlacementSection() {
  const attachment = useEditorStore((s) =>
    s.config.attachments.find((a) => a.socket === "base.platform"),
  );
  const setAttachmentOffset = useEditorStore((s) => s.setAttachmentOffset);
  if (!attachment) return null;
  const activeId =
    COMPANION_SPOTS.find(
      (spot) =>
        JSON.stringify(spot.offset?.position ?? null) ===
        JSON.stringify(attachment.offset?.position ?? null),
    )?.id ?? "right";
  return (
    <section>
      <SectionHeading>Placement</SectionHeading>
      <SegmentedControl<"right" | "front" | "left">
        options={COMPANION_SPOTS.map((s) => ({ value: s.id, label: s.label }))}
        value={activeId}
        onChange={(id) =>
          setAttachmentOffset(
            "base.platform",
            COMPANION_SPOTS.find((s) => s.id === id)?.offset,
          )
        }
      />
    </section>
  );
}

interface Subsection {
  id: string;
  label: string;
  node: React.ReactNode;
}

/**
 * Derive the category's subsections from its data definition. Each becomes
 * an entry in the secondary navigation column; single-subsection categories
 * (pose, color, …) render without a subnav. Pure data — future deities'
 * categories flow through the same derivation.
 */
function useSubsections(category: EditorCategory): Subsection[] {
  const arms = useEditorStore((s) => s.config.arms);
  const body = useEditorStore((s) => s.config.parts.body);
  const active = activeArmSlots(arms);

  /**
   * The anatomy the figure is actually built on.
   *
   * Not the deity's declared skeleton, which is a statement about the
   * form rather than about the statue: Shiva's declares four arms and the
   * human body he is built on has two, so the Pose panel offered sliders
   * for a Back Left Arm that no rig had — they moved, and nothing else
   * did. The resolution is what the engine builds from, so it is what the
   * editor offers.
   */
  const anatomy = useMemo(() => {
    const resolved = resolveCharacterPresentation(useEditorStore.getState().config);
    return { skeleton: resolved.skeleton, armSlots: new Set<string>(resolved.armSlots) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, arms]);
  const socketSubsections = (sockets: readonly SocketId[], allowNone: boolean): Subsection[] =>
    sockets
      .filter((socket) => {
        const match = socket.match(/^arm\.(\w+)\.hand\.item$/);
        return !match || (active as readonly string[]).includes(match[1] ?? "");
      })
      .map((socket) => ({
        id: socket,
        label: getSocket(socket).label,
        node: (
          <>
            <SocketSection socket={socket} allowNone={allowNone} />
            {socket === "base.platform" && <CompanionPlacementSection />}
          </>
        ),
      }));

  switch (category.content.type) {
    case "parts": {
      const sections: Subsection[] = category.content.slots.map((slot) => ({
        id: slot,
        label: SLOT_LABELS[slot],
        node: <PartSlotSection slot={slot} />,
      }));
      if (category.id === "face") {
        sections.push({ id: "shape", label: "Face Shaping", node: <FaceMorphSection /> });
      }
      if (category.id === "body") {
        sections.push({
          id: "form",
          label: "Arms & Build",
          node: (
            <>
              <BodyVariantSection />
              <ArmCountSection />
              <ProportionsSection />
            </>
          ),
        });
      }
      return sections;
    }
    case "sockets":
      return socketSubsections(category.content.sockets, category.content.allowNone);
    case "mixed":
      return [
        ...socketSubsections(category.content.sockets, category.content.allowNone),
        ...category.content.slots.map((slot) => ({
          id: slot,
          label: SLOT_LABELS[slot],
          node: <PartSlotSection slot={slot} />,
        })),
      ];
    case "hands":
      return [{ id: "hands", label: "Hands", node: <HandsPanel /> }];
    case "pose": {
      // Presets first, then joint control organized by semantic body part
      // (grouping declared on the skeleton itself — data-driven), and only
      // the parts this figure HAS: an arm the body does not carry is not
      // a body part the customer can bend.
      const groups = anatomy.skeleton.uiGroups.filter((group) =>
        group.joints.some((joint) => {
          const slot = /^arm\.([A-Za-z]+)\./.exec(joint.id)?.[1];
          return !slot || anatomy.armSlots.has(slot);
        }),
      );
      return [
        { id: "presets", label: "Presets", node: <PosePresetsSection /> },
        ...groups.map((group) => ({
          id: `joints:${group.label}`,
          label: group.label,
          node: <JointGroupSection joints={group.joints} />,
        })),
      ];
    }
    case "materials":
      return [{ id: "materials", label: "Color", node: <MaterialsPanel /> }];
    case "base":
      return [{ id: "base", label: "Base", node: <BasePanel /> }];
    case "form":
      return [{ id: "form", label: "Divine Form", node: <DivineFormPanel /> }];
  }
}

function CategoryPanelBody({ category }: { category: EditorCategory }) {
  const activeSubcategoryId = useUiStore((s) => s.activeSubcategoryId);
  const setActiveSubcategory = useUiStore((s) => s.setActiveSubcategory);
  const subsections = useSubsections(category);
  const activeSection =
    subsections.find((s) => s.id === activeSubcategoryId) ?? subsections[0];
  if (!activeSection) return null;
  const showSubnav = subsections.length > 1;

  return (
    <div className="flex min-h-0 flex-1">
      {showSubnav && (
        <nav
          aria-label={`${category.label} sections`}
          className="w-32 shrink-0 overflow-y-auto border-r border-surface-800 bg-surface-950 py-2"
        >
          {subsections.map((section) => {
            const selected = section.id === activeSection.id;
            return (
              <button
                key={section.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => setActiveSubcategory(section.id)}
                className={`block w-full border-l-2 px-3 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-saffron-400 [@media(max-height:820px)]:py-1.5 ${
                  selected
                    ? "border-saffron-500 bg-surface-850 font-medium text-stone-100"
                    : "border-transparent text-stone-400 hover:bg-surface-850 hover:text-stone-200"
                }`}
              >
                {section.label}
              </button>
            );
          })}
        </nav>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4">{activeSection.node}</div>
    </div>
  );
}

/**
 * What the figure did with the choices, in the customer's words.
 *
 * The resolver already decides these and writes a sentence for each: a
 * blessing hand puts its trident down, an attribute with nowhere to go on
 * this body is left out. Those sentences used to reach a console warning
 * and nothing else, so from the customer's side an attribute simply
 * vanished when they changed a mudra. Shown here they are the difference
 * between a rule and a bug.
 */
function ResolutionNotices() {
  const config = useEditorStore((s) => s.config);
  const issues = useMemo(
    () => customerFacingIssues(resolveCharacterPresentation(config)),
    [config],
  );
  if (issues.length === 0) return null;
  return (
    <div className="border-b border-surface-800 bg-surface-950/60 px-4 py-3">
      <ul className="space-y-1.5">
        {issues.map((issue, index) => (
          <li
            key={`${issue.assetId ?? "issue"}-${index}`}
            className="flex gap-2 text-[11px] leading-snug text-stone-400"
          >
            <span
              aria-hidden
              className={
                issue.severity === "rejected"
                  ? "mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  : "mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-500"
              }
            />
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomizationPanel() {
  const deity = useDeity();
  const activeCategoryId = useUiStore((s) => s.activeCategoryId);
  const category =
    [DIVINE_FORM_CATEGORY, ...deity.categories].find((c) => c.id === activeCategoryId) ??
    deity.categories[0];
  if (!category) return null;

  return (
    <aside className="flex h-full w-[30rem] max-w-[40vw] flex-col border-l border-surface-800 bg-surface-900">
      <header className="border-b border-surface-800 px-4 py-3">
        <h2 className="font-display text-base text-stone-100">{category.label}</h2>
        <p className="text-xs text-stone-500">{category.description}</p>
      </header>
      <ResolutionNotices />
      <CategoryPanelBody category={category} />
    </aside>
  );
}
