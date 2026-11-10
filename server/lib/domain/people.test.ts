import { describe, expect, it } from 'vitest';
import { currentTurn, nextTurn } from './rotation';
import { findMentions, mentionQuery } from './mentions';

describe('taking turns', () => {
  const p = [{ id: 'j', name: 'Jo' }, { id: 's', name: 'Sam' }, { id: 'a', name: 'Al' }];
  it('goes round in name order and survives people leaving', () => {
    expect(currentTurn(p, null)).toBe('a');
    expect(currentTurn(p, 's')).toBe('s');
    expect(nextTurn(p, 'a')).toBe('j');
    expect(nextTurn(p, 's')).toBe('a');
    expect(nextTurn(p, 'gone')).toBe('a');
    expect(nextTurn([], 'a')).toBeNull();
    expect(nextTurn([p[0]], 'j')).toBe('j');
  });
});

describe('mentions', () => {
  const people = [{ id: '1', name: 'Sam Reed' }, { id: '2', name: 'Sam Olsen' }, { id: '3', name: 'Jo Park' }, { id: '4', name: 'Joan Lee' }];
  it('matches full names, and first names only when unique', () => {
    expect(findMentions('@Jo can you look at this?', people)).toEqual(['3']);
    expect(findMentions('thanks @sam', people)).toEqual([]); // two Sams: ambiguous
    expect(findMentions('thanks @Sam Olsen and @Joan', people)).toEqual(['2', '4']);
    expect(findMentions('email jo@example.com', people)).toEqual([]);
    expect(findMentions('@Jo Park, @jo park again', people)).toEqual(['3']);
    expect(findMentions('no mentions here', people)).toEqual([]);
  });
  it('finds the name being typed', () => {
    expect(mentionQuery('ask @Sa')).toBe('Sa');
    expect(mentionQuery('ask @')).toBe('');
    expect(mentionQuery('ask @Sam Re')).toBe('Sam Re');
    expect(mentionQuery('ask Sam')).toBeNull();
    expect(mentionQuery('a@b')).toBeNull();
  });
});
