import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'cursor-pointer group/btn whitespace-nowrap focus-visible:outline-none inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-60 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary/90 data-[state=open]:bg-primary/90',
        mono: 'bg-zinc-950 text-white hover:bg-zinc-950/90 data-[state=open]:bg-zinc-950/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 data-[state=open]:bg-destructive/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/90 data-[state=open]:bg-secondary/90',
        outline:
          'bg-background text-accent-foreground border border-input hover:bg-accent data-[state=open]:bg-accent',
        dashed:
          'text-accent-foreground border border-input border-dashed bg-background hover:bg-accent hover:text-accent-foreground data-[state=open]:text-accent-foreground',
        ghost:
          'text-accent-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
        dim: 'text-muted-foreground hover:text-foreground data-[state=open]:text-foreground',
        foreground: '',
        inverse: '',
      },
      appearance: {
        default: '',
        ghost: '',
      },
      size: {
        lg: 'h-10 rounded-md px-4 text-sm gap-1.5 [&_svg:not([class*=size-])]:w-4 [&_svg:not([class*=size-])]:h-4',
        md: 'h-8.5 rounded-md px-3 gap-1.5 text-[0.8125rem] leading-5 [&_svg:not([class*=size-])]:w-4 [&_svg:not([class*=size-])]:h-4',
        sm: 'h-7 rounded-md px-2.5 gap-1 text-xs [&_svg:not([class*=size-])]:w-3.5 [&_svg:not([class*=size-])]:h-3.5',
        icon: 'w-8.5 h-8.5 rounded-md [&_svg:not([class*=size-])]:w-4 [&_svg:not([class*=size-])]:h-4 shrink-0',
      },
      shape: {
        default: '',
        circle: 'rounded-full',
      },
      mode: {
        default:
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        icon: 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        link: 'text-primary h-auto p-0 bg-transparent rounded-none hover:bg-transparent data-[state=open]:bg-transparent',
      },
    },
    compoundVariants: [
      // Icons opacity
      {
        variant: 'ghost',
        mode: 'default',
        className:
          '[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60',
      },
      {
        variant: 'outline',
        mode: 'default',
        className:
          '[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60',
      },
      {
        variant: 'dashed',
        mode: 'default',
        className:
          '[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60',
      },
      {
        variant: 'secondary',
        mode: 'default',
        className:
          '[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60',
      },
      // Shadow
      {
        variant: 'primary',
        mode: 'default',
        appearance: 'default',
        className: 'shadow-sm shadow-black/5',
      },
      {
        variant: 'outline',
        mode: 'default',
        appearance: 'default',
        className: 'shadow-sm shadow-black/5',
      },
      {
        variant: 'dashed',
        mode: 'default',
        appearance: 'default',
        className: 'shadow-sm shadow-black/5',
      },
      // Ghost appearance
      {
        variant: 'primary',
        appearance: 'ghost',
        className:
          'bg-transparent text-primary/90 hover:bg-primary/5 data-[state=open]:bg-primary/5',
      },
      {
        variant: 'destructive',
        appearance: 'ghost',
        className:
          'bg-transparent text-destructive/90 hover:bg-destructive/5 data-[state=open]:bg-destructive/5',
      },
      {
        variant: 'ghost',
        mode: 'icon',
        className: 'text-muted-foreground',
      },
      // Icon sizes
      {
        size: 'sm',
        mode: 'icon',
        className: 'w-7 h-7 p-0 [&_svg:not([class*=size-])]:w-3.5 [&_svg:not([class*=size-])]:h-3.5',
      },
      {
        size: 'md',
        mode: 'icon',
        className: 'w-8.5 h-8.5 p-0 [&_svg:not([class*=size-])]:w-4 [&_svg:not([class*=size-])]:h-4',
      },
      {
        size: 'lg',
        mode: 'icon',
        className: 'w-10 h-10 p-0 [&_svg:not([class*=size-])]:w-4 [&_svg:not([class*=size-])]:h-4',
      },
    ],
    defaultVariants: {
      variant: 'primary',
      mode: 'default',
      size: 'md',
      shape: 'default',
      appearance: 'default',
    },
  },
);

function Button({
  className,
  selected,
  variant,
  shape,
  appearance,
  mode,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    selected?: boolean;
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({
          variant,
          size,
          shape,
          appearance,
          mode,
          className,
        }),
        asChild && props.disabled && 'pointer-events-none opacity-50',
      )}
      {...(selected && { 'data-state': 'open' })}
      {...props}
    />
  );
}

interface ButtonArrowProps extends React.SVGProps<SVGSVGElement> {
  icon?: LucideIcon;
}

function ButtonArrow({
  icon: Icon = ChevronDown,
  className,
  ...props
}: ButtonArrowProps) {
  return (
    <Icon
      data-slot="button-arrow"
      className={cn('ms-auto -me-1', className)}
      {...props}
    />
  );
}

export { Button, ButtonArrow, buttonVariants };
