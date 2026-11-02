// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SongBrowser } from "./SongBrowser";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

describe("SongBrowser", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ songs: [], nextCursor: null }))); });

  it("debounces search, syncs q to the URL, and renders highlighted results", async () => {
    const fetcher = vi.mocked(fetch);
    window.history.replaceState(null, "", "/songs");
    render(<SongBrowser/>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    fetcher.mockResolvedValueOnce(Response.json({ songs: [{ id: "song-1", title: "Blue Room", hasInstrumental: true, matchedIn: ["lyrics"], snippet: "the blue room is quiet" }], nextCursor: null }));

    fireEvent.change(screen.getByLabelText("Search songs and lyrics"), { target: { value: "blue" } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    await screen.findByText("Blue Room");

    expect(replace).toHaveBeenCalledWith("/songs?q=blue", { scroll: false });
    expect(screen.getByText("blue", { selector: "mark" })).toBeTruthy();
    expect(screen.getByText("lyrics")).toBeTruthy();
  });
});
