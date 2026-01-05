#!/usr/bin/env python3
"""
Organize sprint artifacts into status-based subfolders.
Uses simple string parsing instead of YAML library.
"""
import os
import shutil
import re

YAML_PATH = '/Users/leonliang/Github Repo/gracestowel/docs/sprint/sprint-artifacts/sprint-status.yaml'
BASE_DIR = '/Users/leonliang/Github Repo/gracestowel/docs/sprint/sprint-artifacts'

# Status folders to create
STATUS_FOLDERS = ['done', 'ready-for-dev', 'in-progress', 'backlog', 'drafted']

def parse_stories_from_yaml():
    """Parse story paths and statuses using regex"""
    stories = {}
    
    with open(YAML_PATH, 'r') as f:
        content = f.read()
    
    # Pattern to match story entries with path and status
    # Matches entries like:
    #   story-name:
    #     path: docs/sprint/sprint-artifacts/story-name.md
    #     status: done
    pattern = r'(\S+):\s*\n\s+path:\s*(\S+)\s*\n\s+status:\s*(\S+)'
    
    for match in re.finditer(pattern, content):
        story_key = match.group(1)
        path = match.group(2)
        status = match.group(3)
        filename = os.path.basename(path)
        stories[filename] = status
        
    return stories

def organize_stories():
    print("Parsing sprint-status.yaml...")
    stories = parse_stories_from_yaml()
    print(f"Found {len(stories)} stories with paths")
    
    # Create status folders
    for folder in STATUS_FOLDERS:
        folder_path = os.path.join(BASE_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)
        print(f"Created/verified folder: {folder}/")
    
    moved_count = 0
    skipped_count = 0
    
    for filename, status in stories.items():
        src_path = os.path.join(BASE_DIR, filename)
        
        # Check if file exists at root level
        if not os.path.exists(src_path):
            continue
        
        # Determine target folder
        target_folder = status if status in STATUS_FOLDERS else 'backlog'
        target_path = os.path.join(BASE_DIR, target_folder, filename)
        
        # Move the file
        try:
            shutil.move(src_path, target_path)
            print(f'Moved to {target_folder}/: {filename}')
            moved_count += 1
        except Exception as e:
            print(f'Error moving {filename}: {e}')
            skipped_count += 1
    
    print(f'\n--- Summary ---')
    print(f'Moved: {moved_count} files')
    print(f'Skipped/Not found: {skipped_count} files')

if __name__ == '__main__':
    organize_stories()
    print("Done!")
