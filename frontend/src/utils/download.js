import { resourcesApi } from "@/api";
import { notify } from "@/notify";
import { getters, mutations, state } from "@/store";

export const INDIVIDUAL_DOWNLOAD_FORMAT = "individual";

function canDownloadIndividually(items) {
  return (
    items.length > 1 &&
    items.every((item) => item && !item.isDir && item.type !== "directory")
  );
}

export default function downloadFiles(items) {
  if (items.length === 0) {
    notify.showError("No files selected");
    return;
  }
  if (typeof items[0] === "number") {
    items = items.map((i) => state.req.items.at(i));
  }

  const downloadChunkSizeMb = state.user?.fileLoading?.downloadChunkSizeMb || 0;
  const sizeThreshold = downloadChunkSizeMb * 1024 * 1024;

  const willUseChunkedDownload =
    downloadChunkSizeMb > 0 &&
    items.length === 1 &&
    !items[0].isDir &&
    items[0].size &&
    items[0].size >= sizeThreshold;

  const isMultiItemArchive =
    items.length > 1 || (items.length === 1 && items[0].isDir);

  const willUseChunkedArchive =
    downloadChunkSizeMb > 0 && isMultiItemArchive;

  const showChunkedProgressFirst =
    willUseChunkedDownload || willUseChunkedArchive;

  if (getters.isShare()) {
    if (getters.isSingleFileSelected()) {
      if (showChunkedProgressFirst) {
        mutations.showPrompt({ name: "download" });
        void startDownload(null, items, state.shareInfo.hash, {
          silentChunkedError: true,
        });
      } else {
        void startDownload(null, items, state.shareInfo.hash);
      }
    } else {
      mutations.showPrompt({
        name: "download",
        props: { allowIndividual: canDownloadIndividually(items) },
        confirm: (format) => {
          mutations.closeTopPrompt();
          if (format === INDIVIDUAL_DOWNLOAD_FORMAT) {
            void startIndividualDownload(items, state.shareInfo.hash);
            return;
          }
          void startDownload(format, items, state.shareInfo.hash, {
            silentChunkedError: willUseChunkedArchive,
          });
        },
      });
    }
    return;
  }

  if (getters.isSingleFileSelected()) {
    if (showChunkedProgressFirst) {
      mutations.showPrompt({ name: "download" });
      void startDownload(null, items, "", { silentChunkedError: true });
    } else {
      void startDownload(null, items);
    }
  } else {
    mutations.showPrompt({
      name: "download",
      props: { allowIndividual: canDownloadIndividually(items) },
      confirm: (format) => {
        mutations.closeTopPrompt();
        if (format === INDIVIDUAL_DOWNLOAD_FORMAT) {
          void startIndividualDownload(items);
          return;
        }
        void startDownload(format, items, "", {
          silentChunkedError: willUseChunkedArchive,
        });
      },
    });
  }
}

async function startDownload(config, files, hash = "", options = {}) {
  try {
    notify.showSuccessToast("Downloading...");
    await resourcesApi.download(config, files, hash);
  } catch (e) {
    if (
      e?.name === "AbortError" ||
      e?.message?.includes("aborted") ||
      e?.message?.includes("cancelled")
    ) {
      return;
    }
    if (options.silentChunkedError) {
      return;
    }
    notify.showError(`Error downloading: ${e.message || e}`);
  }
}

export function showShareDownloadPrompt(items) {
  if (items.length === 0) {
    notify.showError("No files selected");
    return;
  }
  if (typeof items[0] === "number") {
    items = items.map((i) => state.req.items.at(i));
  }

  const downloadChunkSizeMb = state.user?.fileLoading?.downloadChunkSizeMb || 0;
  const isMultiItemArchive =
    items.length > 1 || (items.length === 1 && items[0].isDir);
  const willUseChunkedArchive =
    downloadChunkSizeMb > 0 && isMultiItemArchive;

  mutations.showPrompt({
    name: "download",
    props: { allowIndividual: canDownloadIndividually(items) },
    confirm: (format) => {
      mutations.closeTopPrompt();
      if (format === INDIVIDUAL_DOWNLOAD_FORMAT) {
        void startIndividualDownload(items, state.shareInfo?.hash || "");
        return;
      }
      void startDownload(format, items, state.shareInfo?.hash || "", {
        silentChunkedError: willUseChunkedArchive,
      });
    },
  });
}

export async function startIndividualDownload(items, shareHash = "") {
  if (!Array.isArray(items) || items.length < 2) {
    throw new Error("Individual downloads require at least two files");
  }
  if (!canDownloadIndividually(items)) {
    throw new Error("Individual downloads support files only");
  }
  await resourcesApi.downloadFilesIndividually(items, shareHash);
}
