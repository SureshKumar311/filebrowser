import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { stateMock } = vi.hoisted(() => ({
  stateMock: { sessionId: "test-session" },
}));

vi.mock("@/utils/constants", () => ({
  globalVars: { baseURL: "/", externalUrl: "" },
}));

vi.mock("@/store", () => ({
  getters: {},
  mutations: {},
  state: stateMock,
}));

vi.mock("@/notify", () => ({
  notify: { showError: vi.fn() },
}));

import { download, downloadFilesIndividually } from "@/api/resources";

let clickedLinks;
let clickSpy;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  clickedLinks = [];
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function () {
      clickedLinks.push(this);
    });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  clickSpy.mockRestore();
});

describe("downloadFilesIndividually", () => {
  it.each([2, 5, 12])("starts %i separate native file downloads", (count) => {
    const files = Array.from({ length: count }, (_, index) => ({
      path: `/photos/file-${index + 1}.jpg`,
      source: `source-${index + 1}`,
      type: "file",
    }));

    downloadFilesIndividually(files);

    expect(clickSpy).toHaveBeenCalledTimes(count);
    expect(clickedLinks).toHaveLength(count);
    clickedLinks.forEach((link, index) => {
      const file = files.at(index);
      const url = new URL(link.href);
      expect(link.hasAttribute("download")).toBe(true);
      expect(link.download).toBe(file.path.split("/").at(-1));
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
      expect(url.pathname).toBe("/api/resources/download");
      expect(url.searchParams.get("file")).toBe(file.path);
      expect(url.searchParams.get("source")).toBe(file.source);
      expect(url.searchParams.get("sessionId")).toBe("test-session");
    });
    expect(document.querySelectorAll("a")).toHaveLength(count);

    vi.advanceTimersByTime(1000);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("keeps shared-download hash routing for every file", () => {
    const files = [
      { path: "/shared/a.jpg", type: "file" },
      { path: "/shared/b.jpg", type: "file" },
    ];

    downloadFilesIndividually(files, "share-hash");

    expect(clickedLinks).toHaveLength(2);
    for (const link of clickedLinks) {
      const url = new URL(link.href);
      expect(url.pathname).toBe("/public/api/resources/download");
      expect(url.searchParams.get("hash")).toBe("share-hash");
      expect(url.searchParams.has("source")).toBe(false);
    }
  });

  it("rejects folder selections before creating download links", () => {
    expect(() =>
      downloadFilesIndividually([
        { path: "/photos/a.jpg", source: "default", type: "file" },
        { path: "/photos/folder", source: "default", type: "directory", isDir: true },
      ]),
    ).toThrow("Individual downloads support files only");

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it.each(["zip", "tar.gz"])("preserves %s archive downloads", async (format) => {
    const files = [
      { path: "/photos/a.jpg", source: "default", type: "file" },
      { path: "/photos/b.jpg", source: "default", type: "file" },
    ];

    await download(format, files);

    const url = new URL(clickedLinks[0].href);
    expect(url.pathname).toBe("/api/resources/download");
    expect(url.searchParams.get("algo")).toBe(format);
    expect(url.searchParams.getAll("file")).toEqual(files.map((file) => file.path));
  });

  it("preserves public share routing for archive downloads", async () => {
    const files = [
      { path: "/shared/a.jpg", type: "file" },
      { path: "/shared/b.jpg", type: "file" },
    ];

    await download("zip", files, "share-hash");

    const url = new URL(clickedLinks[0].href);
    expect(url.pathname).toBe("/public/api/resources/download");
    expect(url.searchParams.get("hash")).toBe("share-hash");
    expect(url.searchParams.getAll("file")).toEqual(files.map((file) => file.path));
  });
});
