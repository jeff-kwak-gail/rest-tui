#!/usr/bin/env node
import { render } from "ink";
import App from "./app.js";

const filePath = process.argv[2] || null;

render(<App initialFile={filePath} />, { exitOnCtrlC: true });
