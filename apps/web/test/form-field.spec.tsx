import { render, screen } from '@testing-library/react';

import { FormField, Input } from '@/components/ui';

describe('FormField', () => {
  it('links the label to the control', () => {
    render(<FormField label="Email">{(props) => <Input {...props} type="email" />}</FormField>);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('marks the control invalid and describes it by the error', () => {
    render(
      <FormField label="Email" error="Введіть коректну email-адресу">
        {(props) => <Input {...props} type="email" />}
      </FormField>,
    );

    const input = screen.getByLabelText('Email');
    const message = screen.getByText('Введіть коректну email-адресу');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
  });

  it('describes the control by the hint when there is no error', () => {
    render(
      <FormField label="Пароль" hint="Щонайменше 8 символів.">
        {(props) => <Input {...props} type="password" />}
      </FormField>,
    );

    const input = screen.getByLabelText('Пароль');

    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.getAttribute('aria-describedby')).toBe(
      screen.getByText('Щонайменше 8 символів.').id,
    );
  });

  it('has no describedby when there is nothing to describe', () => {
    render(<FormField label="Ім'я">{(props) => <Input {...props} type="text" />}</FormField>);

    expect(screen.getByLabelText("Ім'я")).not.toHaveAttribute('aria-describedby');
  });
});
