import { describe, expect, it } from 'vitest'
import { homeStructuredData, jsonLd } from './structuredData'

describe('home structured data', () => {
  const graph = homeStructuredData()['@graph'] as Record<string, unknown>[]
  const byType = (type: string) => graph.find((node) => node['@type'] === type)!

  it('describes the organization, site and product with absolute www URLs', () => {
    expect(graph.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
    expect(byType('Organization')).toMatchObject({ name: 'Incantly', legalName: 'Genesis HQ', url: 'https://www.incantly.xyz/' })
    expect((byType('Organization').logo as { url: string }).url).toBe('https://www.incantly.xyz/apple-icon.png')
    expect(byType('WebSite')).toMatchObject({ name: 'Incantly', publisher: { '@id': 'https://www.incantly.xyz/#organization' } })
  })

  it('lists the contact address and leaves out details that are not known yet', () => {
    const organization = byType('Organization')
    expect(organization.contactPoint).toEqual([
      { '@type': 'ContactPoint', contactType: 'customer support', email: 'team@incantly.xyz' },
      { '@type': 'ContactPoint', contactType: 'privacy', email: 'team@incantly.xyz' },
    ])
    expect(organization).not.toHaveProperty('address')
    expect(organization).not.toHaveProperty('sameAs')
  })

  it('escapes < so the JSON cannot close its script tag', () => {
    expect(jsonLd({ text: '</script><script>alert(1)</script>' })).not.toContain('<')
  })
})
