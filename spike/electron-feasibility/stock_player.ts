// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The stock <moq-watch> element from @moq/watch, unmodified, pointed at the relay and broadcast
// the page's query names.
import "@moq/watch/element";

const query = new URLSearchParams(location.search);
const watchElement = document.createElement("moq-watch");
watchElement.setAttribute("url", query.get("url") ?? "http://127.0.0.1:4443");
watchElement.setAttribute("name", query.get("name") ?? "");
watchElement.append(document.createElement("canvas"));
document.getElementById("stock-player-slot")?.append(watchElement);
const label = document.getElementById("stock-player-label");
if (label) label.textContent = `stock @moq/watch 0.6.3 <moq-watch url="${watchElement.getAttribute("url")}" name="${watchElement.getAttribute("name")}">`;
