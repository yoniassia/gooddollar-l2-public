import type { Meta, StoryObj } from '@storybook/react'
import { SummaryCard } from './summary-card'

const meta = {
  title: 'UI/SummaryCard',
  component: SummaryCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: { type: 'text' },
    },
    className: {
      control: { type: 'text' },
    },
  },
} satisfies Meta<typeof SummaryCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Total Portfolio Value',
    value: '$12,345.67',
  },
}

export const Positive: Story = {
  args: {
    label: 'Unrealized P&L',
    value: '+$1,234.56',
    color: 'text-green-400',
  },
}

export const Negative: Story = {
  args: {
    label: 'Unrealized P&L',
    value: '-$567.89',
    color: 'text-red-400',
  },
}

export const Large: Story = {
  args: {
    label: 'Total Trading Volume',
    value: '$1,234,567.89',
  },
}

export const Compact: Story = {
  args: {
    label: 'Available Balance',
    value: '$100.00',
    className: 'max-w-xs',
  },
}

export const CryptoBalance: Story = {
  args: {
    label: 'ETH Balance',
    value: '12.5678 ETH',
  },
}

export const Percentage: Story = {
  args: {
    label: 'Success Rate',
    value: '78.5%',
    color: 'text-blue-400',
  },
}

export const UBIContribution: Story = {
  args: {
    label: 'UBI Funded',
    value: '$45.23',
    color: 'text-goodgreen',
  },
}

export const MultipleCards: Story = {
  args: {
    label: 'Portfolio Example',
    value: 'Multiple Cards',
  },
  parameters: {
    layout: 'centered',
  },
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-4xl">
      <SummaryCard label="Portfolio Value" value="$12,345.67" />
      <SummaryCard label="P&L Today" value="+$234.56" color="text-green-400" />
      <SummaryCard label="UBI Contributed" value="$45.23" color="text-goodgreen" />
    </div>
  ),
}