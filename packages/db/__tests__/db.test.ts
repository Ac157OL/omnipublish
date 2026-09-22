import { describe, it, expect } from 'vitest';
import { prisma, PrismaClient } from '../index';

describe('db', () => {
  it('exports prisma instance', () => {
    expect(prisma).toBeDefined();
  });

  it('prisma is an instance of PrismaClient', () => {
    expect(prisma).toBeInstanceOf(PrismaClient);
  });

  it('exports PrismaClient class', () => {
    expect(PrismaClient).toBeDefined();
    expect(typeof PrismaClient).toBe('function');
  });
});
