import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('App', () => {
  it('renders the cup editor', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Cup editor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Placement/i })).toBeInTheDocument()
    expect(screen.getByText('Printable design and brand')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate printable design/i })).toBeInTheDocument()
  })
})
