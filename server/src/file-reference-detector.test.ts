import { describe, expect, it } from "vitest";

import { detectFileReference } from "./file-reference-detector";

describe("detectFileReference", () => {
  // ── Deictic reference detection (should detect) ──

  describe("deictic references without attachments", () => {
    it("detects 'upscale these photos'", () => {
      const r = detectFileReference("upscale these photos", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects 'process files in this folder'", () => {
      const r = detectFileReference("process files in this folder", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects 'organize my images by date'", () => {
      const r = detectFileReference("organize my images by date", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects 'enhance the attached photos'", () => {
      const r = detectFileReference("enhance the attached photos", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects quantified deictic 'upscale these 5 photos'", () => {
      const r = detectFileReference("upscale these 5 photos", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects 'analyze this video'", () => {
      const r = detectFileReference("analyze this video", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects 'make a contact sheet of my photos'", () => {
      const r = detectFileReference("make a contact sheet of my photos", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });

    it("detects 'edit the shots from this folder'", () => {
      const r = detectFileReference("edit the shots from this folder", false);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(true);
    });
  });

  // ── With attachments (should NOT be missing) ──

  describe("with attachments present", () => {
    it("has file ref but NOT missing when attachments present", () => {
      const r = detectFileReference("upscale these photos", true);
      expect(r.referencesFiles).toBe(true);
      expect(r.missingAttachments).toBe(false);
    });

    it("returns null suggestedPrompt when attachments present", () => {
      const r = detectFileReference("process these images", true);
      expect(r.suggestedPrompt).toBeNull();
    });
  });

  // ── Conceptual questions (should NOT detect) ──

  describe("conceptual questions", () => {
    it("ignores 'what is a good photo composition'", () => {
      const r = detectFileReference("what is a good photo composition", false);
      expect(r.referencesFiles).toBe(false);
    });

    it("ignores 'how to edit photos in Lightroom'", () => {
      const r = detectFileReference("how to edit photos in Lightroom", false);
      expect(r.referencesFiles).toBe(false);
    });

    it("ignores 'explain video editing techniques'", () => {
      const r = detectFileReference("explain video editing techniques", false);
      expect(r.referencesFiles).toBe(false);
    });

    it("ignores 'tell me about image compression'", () => {
      const r = detectFileReference("tell me about image compression", false);
      expect(r.referencesFiles).toBe(false);
    });
  });

  // ── Non-file messages (should NOT detect) ──

  describe("non-file messages", () => {
    it("ignores 'write me a haiku about rain'", () => {
      const r = detectFileReference("write me a haiku about rain", false);
      expect(r.referencesFiles).toBe(false);
    });

    it("ignores 'hello, how are you?'", () => {
      const r = detectFileReference("hello, how are you?", false);
      expect(r.referencesFiles).toBe(false);
    });

    it("ignores 'write a Python script'", () => {
      const r = detectFileReference("write a Python script", false);
      expect(r.referencesFiles).toBe(false);
    });

    it("ignores 'compare React vs Vue'", () => {
      const r = detectFileReference("compare React vs Vue", false);
      expect(r.referencesFiles).toBe(false);
    });
  });

  // ── Suggested prompt ──

  describe("suggestedPrompt", () => {
    it("returns prompt containing 'file' when missing attachments", () => {
      const r = detectFileReference("upscale these photos", false);
      expect(r.suggestedPrompt).toBeTruthy();
      expect(r.suggestedPrompt!.toLowerCase()).toContain("file");
    });

    it("returns null when not missing attachments", () => {
      const r = detectFileReference("upscale these photos", true);
      expect(r.suggestedPrompt).toBeNull();
    });

    it("returns null when no file reference detected", () => {
      const r = detectFileReference("write me a poem", false);
      expect(r.suggestedPrompt).toBeNull();
    });
  });
});
