# Repository development rules

- Keep every code identifier, package/crate name, file name, directory name, database name, bundle identifier, URL scheme, and native target name brand-neutral. Name implementation elements by domain or responsibility instead of any current or former product name.
- Product or brand names may appear only in user-visible copy, installer metadata, release artifact names, and product documentation.
- Isolate compatibility with historical identifiers inside explicitly named migration helpers. Do not reuse historical naming in new business logic.
- Run the repository-wide naming scan and the full test/build checks before committing a refactor or feature.
