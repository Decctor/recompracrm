/** `--name=value` and `--flag` from the command line; everything else is positional. */
export function parseArgs(argv: string[] = process.argv.slice(2)) {
	const options: Record<string, string> = {};
	const positionals: string[] = [];
	for (const arg of argv) {
		const match = /^--([a-z0-9-]+)(?:=(.*))?$/i.exec(arg);
		if (match) options[match[1]] = match[2] ?? "true";
		else positionals.push(arg);
	}
	return { options, positionals };
}

/** Runs a script's main function and guarantees a non-zero exit code with a readable message. */
export function runScript(main: () => Promise<void>) {
	main()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error(error instanceof Error ? (error.stack ?? error.message) : error);
			process.exit(1);
		});
}
