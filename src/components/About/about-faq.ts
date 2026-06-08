export function initAboutFaq(root: ParentNode = document): void {
  const lists = root.querySelectorAll<HTMLElement>('.about__faq-list');

  lists.forEach((list) => {
    const items = list.querySelectorAll<HTMLDetailsElement>('.about__faq-item');

    items.forEach((item) => {
      if (item.dataset.faqBound === 'true') return;
      item.dataset.faqBound = 'true';

      item.addEventListener('toggle', () => {
        if (!item.open) return;

        items.forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });
  });
}
