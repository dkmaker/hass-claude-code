#!/usr/bin/env python3
"""
Home Assistant User Docs updater.

Clones the HA user docs repo (home-assistant.io), strips frontmatter (keeping title),
removes MDX components and raw HTML, generates a CLAUDE.md index,
and produces a changelog based on diff.

Usage:
    python update-user-docs.py <target_dir>

Example:
    python update-user-docs.py ./docs/hass-user
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_URL = "https://github.com/home-assistant/home-assistant.io.git"
SOURCE_DIR = "source/_docs"  # User docs are in source/_docs/

# MDX component patterns to strip (multiline)
MDX_COMPONENT_PATTERNS = [
    # Self-closing MDX components
    re.compile(r'<(?:ApiEndpoint|RelatedRules|TabItem|Tabs|CodeBlock|GRADLE_MODULE)[^>]*/>', re.IGNORECASE),
    # Opening+closing MDX components with content
    re.compile(r'<(ApiEndpoint|RelatedRules|TabItem|Tabs|CodeBlock|GRADLE_MODULE)\b[^>]*>.*?</\1>', re.DOTALL | re.IGNORECASE),
    # Opening MDX tags without closing (standalone)
    re.compile(r'<(?:ApiEndpoint|RelatedRules|TabItem|Tabs|CodeBlock|GRADLE_MODULE)\b[^>]*>', re.IGNORECASE),
]

# HTML elements to strip (keep content, remove tags)
HTML_TAG_STRIP = re.compile(r'</?(?:div|span|iframe|img|br|hr|sup|sub|a|p|ul|ol|li|table|thead|tbody|tr|td|th|details|summary)\b[^>]*/?>', re.IGNORECASE)

# Docusaurus import statements
IMPORT_PATTERN = re.compile(r'^import\s+.*?from\s+[\'"]@site/.*$', re.MULTILINE)

# Docusaurus admonitions (:::note, :::tip, etc.) — keep content, strip markers
ADMONITION_MARKER = re.compile(r'^:::\w*\s*$', re.MULTILINE)


def extract_title(content: str) -> str | None:
    """Extract title from YAML frontmatter."""
    match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return None
    frontmatter = match.group(1)
    title_match = re.search(r'^title:\s*["\']?(.*?)["\']?\s*$', frontmatter, re.MULTILINE)
    if title_match:
        return title_match.group(1).strip()
    return None


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter entirely."""
    return re.sub(r'^---\s*\n.*?\n---\s*\n', '', content, count=1, flags=re.DOTALL)


def clean_content(content: str) -> str:
    """Strip MDX components, HTML elements, and Docusaurus-specific syntax."""
    # Remove import statements
    content = IMPORT_PATTERN.sub('', content)

    # Remove MDX components
    for pattern in MDX_COMPONENT_PATTERNS:
        content = pattern.sub('', content)

    # Strip HTML tags (keep inner content)
    content = HTML_TAG_STRIP.sub('', content)

    # Strip admonition markers but keep content
    content = ADMONITION_MARKER.sub('', content)

    # Clean up excessive blank lines
    content = re.sub(r'\n{3,}', '\n\n', content)

    return content.strip() + '\n'


def process_file(src: Path, dst: Path) -> str | None:
    """Process a single doc file. Returns title or None."""
    content = src.read_text(encoding='utf-8', errors='replace')
    title = extract_title(content)
    content = strip_frontmatter(content)
    content = clean_content(content)

    dst.parent.mkdir(parents=True, exist_ok=True)

    # Rename .markdown to .md
    if dst.suffix == '.markdown':
        dst = dst.with_suffix('.md')

    dst.write_text(content, encoding='utf-8')
    return title


def generate_claude_index(target_dir: Path, file_titles: dict):
    """Generate CLAUDE.md index file."""
    index_lines = ["# Home Assistant User Documentation\n\n"]
    index_lines.append("This is a cleaned mirror of the Home Assistant user-facing documentation.\n\n")
    index_lines.append("## Files\n\n")

    for file_path in sorted(file_titles.keys()):
        title = file_titles[file_path]
        title_str = f" - {title}" if title else ""
        index_lines.append(f"- `{file_path}`{title_str}\n")

    (target_dir / "CLAUDE.md").write_text(''.join(index_lines))


def generate_changelog(target_dir: Path, staging_dir: Path):
    """Generate CHANGELOG.md based on diff."""
    target_dir.mkdir(parents=True, exist_ok=True)
    changelog_path = target_dir / "CHANGELOG.md"

    # Compare old vs new
    if not (target_dir / "CLAUDE.md").exists():
        changelog_path.write_text(f"# Changelog\n\n## Initial import\n\nImported {len(list(staging_dir.rglob('*.md')))} files.\n")
        return

    # Run diff
    result = subprocess.run(
        ['diff', '-rq', str(target_dir), str(staging_dir)],
        capture_output=True, text=True
    )

    if result.returncode == 0:
        changelog_path.write_text("# Changelog\n\n## No changes\n")
        return

    # Parse diff output
    added = []
    modified = []
    removed = []

    for line in result.stdout.splitlines():
        if "Only in" in line and str(staging_dir) in line:
            # File added
            parts = line.split(": ")
            if len(parts) == 2:
                added.append(parts[1])
        elif "Only in" in line and str(target_dir) in line:
            # File removed
            parts = line.split(": ")
            if len(parts) == 2:
                removed.append(parts[1])
        elif "differ" in line:
            # File modified
            parts = line.split(" and ")
            if len(parts) == 2:
                rel_path = Path(parts[1].strip()).relative_to(staging_dir)
                modified.append(str(rel_path))

    changelog_lines = ["# Changelog\n\n## Latest update\n\n"]
    if added:
        changelog_lines.append(f"### Added ({len(added)} files)\n")
        for f in added[:10]:
            changelog_lines.append(f"- {f}\n")
        if len(added) > 10:
            changelog_lines.append(f"- ... and {len(added) - 10} more\n")
        changelog_lines.append("\n")

    if modified:
        changelog_lines.append(f"### Modified ({len(modified)} files)\n")
        for f in modified[:10]:
            changelog_lines.append(f"- {f}\n")
        if len(modified) > 10:
            changelog_lines.append(f"- ... and {len(modified) - 10} more\n")
        changelog_lines.append("\n")

    if removed:
        changelog_lines.append(f"### Removed ({len(removed)} files)\n")
        for f in removed[:10]:
            changelog_lines.append(f"- {f}\n")
        if len(removed) > 10:
            changelog_lines.append(f"- ... and {len(removed) - 10} more\n")

    changelog_path.write_text(''.join(changelog_lines))


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    target_dir = Path(sys.argv[1]).resolve()
    print(f"Target directory: {target_dir}")

    with tempfile.TemporaryDirectory() as tmpdir:
        repo_dir = Path(tmpdir) / "repo"
        staging_dir = Path(tmpdir) / "staging"

        print("Cloning repo...")
        subprocess.run(['git', 'clone', '--depth', '1', REPO_URL, str(repo_dir)], check=True)

        source_path = repo_dir / SOURCE_DIR
        if not source_path.exists():
            print(f"ERROR: {SOURCE_DIR} not found in repo")
            sys.exit(1)

        print(f"Processing files from {SOURCE_DIR}...")
        file_titles = {}

        for src_file in source_path.rglob('*.markdown'):
            rel_path = src_file.relative_to(source_path)
            dst_file = staging_dir / rel_path

            title = process_file(src_file, dst_file)
            # Store with .md extension
            if dst_file.suffix == '.md':
                file_titles[str(rel_path.with_suffix('.md'))] = title

        print(f"Processed {len(file_titles)} files")

        print("Generating CLAUDE.md index...")
        generate_claude_index(staging_dir, file_titles)

        print("Generating changelog...")
        generate_changelog(target_dir, staging_dir)

        print("Deploying to target directory...")
        if target_dir.exists():
            # Remove old files except CHANGELOG.md
            for item in target_dir.iterdir():
                if item.name != "CHANGELOG.md":
                    if item.is_dir():
                        shutil.rmtree(item)
                    else:
                        item.unlink()

        # Copy new files
        shutil.copytree(staging_dir, target_dir, dirs_exist_ok=True)

        print(f"✓ Done! User docs updated at {target_dir}")


if __name__ == "__main__":
    main()
